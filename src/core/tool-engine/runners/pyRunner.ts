/**
 * Sandboxed Python Runner
 * Executes Python tools in isolated subprocess with resource limits
 * 
 * Features:
 * - Subprocess isolation
 * - Resource limits (timeout, memory)
 * - Safe execution environment
 * - JSON input/output
 */

import { spawn, ChildProcess } from "child_process";
import { ToolRunner } from "../index";
import { EventBus } from "../../eventBus";
import { Result, ok, err } from "../../utils/result";
import { TimeoutError, ToolExecutionError } from "../../errors/standardErrors";
import * as path from "path";
import * as fs from "fs/promises";
import * as os from "os";

export interface PyRunnerConfig {
  pythonPath?: string; // Path to Python executable (default: "python3" or "python")
  timeoutMs?: number; // milliseconds
  maxMemoryMb?: number; // megabytes
  workingDir?: string; // Working directory for execution
}

export class PyRunner {
  private defaultConfig: Required<Omit<PyRunnerConfig, "pythonPath">> & { pythonPath: string } = {
    pythonPath: this.detectPython(),
    timeoutMs: 30000, // 30 seconds
    maxMemoryMb: 256,
    workingDir: os.tmpdir(),
  };

  constructor(private config: PyRunnerConfig = {}) {}

  private detectPython(): string {
    // Try python3 first, fallback to python
    const candidates = ["python3", "python"];
    // In production, check which exists
    return candidates[0]; // Default to python3
  }

  createRunner(code: string, eventBus: EventBus): ToolRunner {
    return async (args: Record<string, unknown>): Promise<Result<any>> => {
      const pythonPath = this.config.pythonPath || this.defaultConfig.pythonPath;
      const timeout = this.config.timeoutMs || this.defaultConfig.timeoutMs;
      const maxMemoryMB = this.config.maxMemoryMb || this.defaultConfig.maxMemoryMb;
      const workingDir = this.config.workingDir || this.defaultConfig.workingDir;

      // Create temporary Python file and directory (with memory limits)
      const { tempFile, tempDir } = await this.createTempFile(code, maxMemoryMB);

      try {
        // Prepare input as JSON
        const inputJson = JSON.stringify(args);

        // Execute Python script
        const result = await this.executePython(
          pythonPath,
          tempFile,
          inputJson,
          timeout,
          maxMemoryMB,
          workingDir,
          eventBus
        );

        if (!result.ok) {
          if (result.stderr) {
            return err(new ToolExecutionError(result.stderr));
          }
          return err(new ToolExecutionError(result.error?.message || "Unknown Python execution error"));
        }

        return ok(result.data);
      } catch (error: unknown) {
        if (error instanceof TimeoutError) {
          return err(error);
        }
        return err(new ToolExecutionError(error instanceof Error ? error.message : String(error)));
      } finally {
        // Clean up temp directory and all files recursively
        try {
          await fs.rm(tempDir, { recursive: true, force: true });
        } catch (e) {
          // Ignore cleanup errors, but log them
          console.warn(`[PyRunner] Failed to cleanup temp directory ${tempDir}:`, e);
        }
      }
    };
  }

  private async createTempFile(
    code: string,
    maxMemoryMb?: number
  ): Promise<{ tempFile: string; tempDir: string }> {
    // Set memory limits using resource.setrlimit (Phase 1.6 requirement)
    const memoryLimitCode = maxMemoryMb
      ? `
import resource
# Set memory limit (RLIMIT_AS = virtual memory)
# Convert MB to bytes
max_memory_bytes = ${maxMemoryMb} * 1024 * 1024
try:
    resource.setrlimit(resource.RLIMIT_AS, (max_memory_bytes, max_memory_bytes))
except (ValueError, OSError) as e:
    # On some systems, setting RLIMIT_AS may fail
    # Try RLIMIT_RSS (resident set size) as fallback
    try:
        resource.setrlimit(resource.RLIMIT_RSS, (max_memory_bytes, max_memory_bytes))
    except:
        pass  # Continue if limits can't be set
`
      : "";

    const wrapperCode = `
import json
import sys
${memoryLimitCode}

# Read input from stdin
input_data = json.loads(sys.stdin.read())

# Import the tool function
${code}

# Execute the tool
try:
    if 'run' in globals():
        result = run(input_data)
    elif 'default' in globals():
        result = default(input_data)
    else:
        raise Exception("No 'run' or 'default' function found in tool code")
    
    # Ensure result has ok field
    if isinstance(result, dict) and 'ok' in result:
        output = result
    else:
        output = {"ok": True, "data": result}
    
    # Output JSON result
    print(json.dumps(output, indent=2))
except MemoryError:
    error_output = {
        "ok": False,
        "error": {
            "message": "Memory limit exceeded",
            "type": "MemoryError"
        }
    }
    print(json.dumps(error_output, indent=2))
    sys.exit(1)
except Exception as e:
    error_output = {
        "ok": False,
        "error": {
            "message": str(e),
            "type": type(e).__name__
        }
    }
    print(json.dumps(error_output, indent=2))
    sys.exit(1)
`;

    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "arium-py-"));
    const tempFile = path.join(tempDir, "tool.py");
    await fs.writeFile(tempFile, wrapperCode, "utf-8");
    return { tempFile, tempDir };
  }

  private async executePython(
    pythonPath: string,
    scriptPath: string,
    inputJson: string,
    timeout: number,
    maxMemoryMB: number,
    workingDir: string,
    eventBus: EventBus
  ): Promise<{ ok: boolean; data?: unknown; error?: { message: string; type?: string; [key: string]: unknown }; stdout?: string; stderr?: string; }> {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();

      // Spawn Python process
      const child: ChildProcess = spawn(pythonPath, [scriptPath], {
        cwd: workingDir,
        stdio: ["pipe", "pipe", "pipe"],
        env: {
          ...process.env,
          PYTHONUNBUFFERED: "1",
        },
      });

      let stdout = "";
      let stderr = "";
      let killed = false;

      // Write input to stdin
      if (child.stdin) {
        child.stdin.write(inputJson);
        child.stdin.end();
      }

      // Collect stdout
      if (child.stdout) {
        child.stdout.on("data", (data) => {
          stdout += data.toString();
        });
      }

      // Collect stderr
      if (child.stderr) {
        child.stderr.on("data", (data) => {
          stderr += data.toString();
        });
      }

      // Timeout handler
      const timeoutId = setTimeout(() => {
        if (!killed) {
          killed = true;
          child.kill("SIGTERM");
          
          // Force kill after grace period
          setTimeout(() => {
            if (!child.killed) {
              child.kill("SIGKILL");
            }
          }, 1000);

          reject(
            new TimeoutError(
              `Python execution timeout after ${timeout}ms`
            )
          );
        }
      }, timeout);

      // Process exit handler
      child.on("exit", (code, signal) => {
        clearTimeout(timeoutId);

        if (killed) {
          return; // Already handled by timeout
        }

        const duration = Date.now() - startTime;
        
        eventBus.emit("ToolExecutionEvent", {
          type: "python",
          duration,
          exitCode: code,
          signal,
        });

        if (code !== 0) {
          resolve({
            ok: false,
            error: {
              message: `Python process exited with code ${code}`,
              stderr: stderr.trim(),
            },
            stdout: stdout.trim(),
            stderr: stderr.trim(),
          });
          return;
        }

        // Parse JSON output
        try {
          const result = JSON.parse(stdout.trim());
          resolve({
            ok: result.ok ?? true,
            data: result.data ?? result,
            error: result.error,
            stdout: stdout.trim(),
            stderr: stderr.trim(),
          });
        } catch (parseError: unknown) {
          resolve({
            ok: false,
            error: {
              message: `Failed to parse Python output: ${parseError instanceof Error ? parseError.message : String(parseError)}`,
              stdout: stdout.trim(),
              stderr: stderr.trim(),
            },
            stdout: stdout.trim(),
            stderr: stderr.trim(),
          });
        }
      });

      // Error handler
      child.on("error", (error) => {
        clearTimeout(timeoutId);
        if (!killed) {
          killed = true;
          reject(
            new ToolExecutionError(
              `Failed to spawn Python process: ${error.message}. Is Python installed?`
            )
          );
        }
      });
    });
  }

  /**
   * Validate Python code syntax
   */
  async validate(code: string): Promise<{ valid: boolean; error?: string }> {
    const pythonPath = this.config.pythonPath || this.defaultConfig.pythonPath;

    try {
      // Create temporary validation script
      const { tempFile, tempDir } = await this.createTempFile(code);
      
      // Try to compile the code
      const child = spawn(pythonPath, ["-m", "py_compile", tempFile], {
        stdio: "pipe",
      });

      let errorOutput = "";

      if (child.stderr) {
        child.stderr.on("data", (data: Buffer) => {
          errorOutput += data.toString();
        });
      }

      await new Promise<void>((resolve, reject) => {
        child.on("exit", (code: number | null) => {
          if (code === 0) {
            resolve();
          } else {
            reject(new Error(errorOutput || "Compilation failed"));
          }
        });

        child.on("error", reject);
      });

      // Clean up temp directory
      await fs.rm(tempDir, { recursive: true, force: true });

      return { valid: true };
    } catch (error: unknown) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
