/**
 * Sandboxed Python Runner
 *
 * Executes Python code in a subprocess with memory limits enforced in Python.
 * Intended for controlled tool execution.
 */

import fs from "fs/promises";
import os from "os";
import path from "path";
import { spawn } from "child_process";
import { ToolRunner } from "../index";
import { EventBus } from "../../eventBus";
import { ToolExecutionResult } from "../../types";

export interface PyRunnerConfig {
  timeoutMs?: number;
  timeout?: number;
  maxMemoryMb?: number;
  maxMemoryMB?: number;
}

interface NormalizedConfig {
  timeoutMs: number;
  maxMemoryMB: number;
}

export class PyRunner {
  public config: NormalizedConfig;

  constructor(config: PyRunnerConfig = {}) {
    this.config = {
      timeoutMs: config.timeoutMs ?? config.timeout ?? 30000,
      maxMemoryMB: config.maxMemoryMB ?? config.maxMemoryMb ?? 256,
    };
  }

  createRunner(code: string, _eventBus: EventBus): ToolRunner {
    return async (args: Record<string, unknown>): Promise<ToolExecutionResult> => {
      const { tempFile, workDir } = await this.createTempFile(code, this.config.maxMemoryMB);

      try {
        const result = await this.executePython(tempFile, args, this.config.timeoutMs);
        return result;
      } catch (error) {
        return {
          ok: false,
          error: { message: error instanceof Error ? error.message : String(error) },
        };
      } finally {
        await fs.rm(workDir, { recursive: true, force: true });
      }
    };
  }

  async validate(code: string): Promise<{ valid: boolean; error?: string }> {
    if (!code || typeof code !== "string") {
      return { valid: false, error: "Empty or invalid code" };
    }

    return { valid: true };
  }

  private async executePython(
    scriptPath: string,
    args: Record<string, unknown>,
    timeoutMs: number
  ): Promise<ToolExecutionResult> {
    const pythonCommand = "python3";

    return new Promise((resolve) => {
      const child = spawn(pythonCommand, [scriptPath], {
        stdio: ["pipe", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";
      let finished = false;

      const timer = setTimeout(() => {
        if (!finished) {
          child.kill("SIGKILL");
          resolve({
            ok: false,
            error: { message: "Python execution timed out", code: "timeout" },
          });
        }
      }, timeoutMs);

      child.stdout.on("data", (data) => {
        stdout += data.toString();
      });

      child.stderr.on("data", (data) => {
        stderr += data.toString();
      });

      child.on("close", () => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);

        if (!stdout.trim()) {
          resolve({
            ok: false,
            error: { message: stderr.trim() || "Python runner returned no output" },
          });
          return;
        }

        try {
          const parsed = JSON.parse(stdout);
          resolve(parsed as ToolExecutionResult);
        } catch (error) {
          resolve({
            ok: false,
            error: {
              message: `Failed to parse Python output: ${error instanceof Error ? error.message : String(error)}`,
              output: stdout.trim(),
            },
          });
        }
      });

      child.on("error", (error) => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        resolve({
          ok: false,
          error: { message: `Failed to start Python: ${error.message}` },
        });
      });

      child.stdin.write(JSON.stringify(args ?? {}));
      child.stdin.end();
    });
  }

  async createTempFile(code: string, maxMemoryMB: number) {
    const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "arium-py-"));
    const tempFile = path.join(workDir, "tool.py");

    const memoryLimitExpr = `${maxMemoryMB} * 1024 * 1024`;
    const normalizedCode = this.normalizeCode(code);

    const wrapped = `
import json
import sys
import resource
import traceback

def _set_limits():
    limit = ${memoryLimitExpr}
    try:
        resource.setrlimit(resource.RLIMIT_AS, (limit, limit))
    except Exception:
        pass

_set_limits()

${normalizedCode}

def _normalize_result(result):
    if isinstance(result, dict) and "ok" in result:
        return result
    return {"ok": True, "data": result}

def _main():
    raw = sys.stdin.read()
    args = json.loads(raw) if raw else {}
    try:
        result = run(args)
        output = _normalize_result(result)
    except MemoryError as exc:
        output = {"ok": False, "error": {"type": "MemoryError", "message": str(exc)}}
    except Exception as exc:
        output = {"ok": False, "error": {"type": exc.__class__.__name__, "message": str(exc)}}

    sys.stdout.write(json.dumps(output))

if __name__ == "__main__":
    _main()
`;

    await fs.writeFile(tempFile, wrapped, "utf-8");
    return { tempFile, workDir };
  }

  private normalizeCode(code: string): string {
    const lines = code.replace(/\r\n/g, "\n").split("\n");
    while (lines.length > 0 && lines[0].trim() === "") {
      lines.shift();
    }
    while (lines.length > 0 && lines[lines.length - 1].trim() === "") {
      lines.pop();
    }

    const indents = lines
      .filter((line) => line.trim().length > 0)
      .map((line) => line.match(/^(\s*)/)?.[1].length ?? 0);

    const minIndent = indents.length > 0 ? Math.min(...indents) : 0;
    return lines.map((line) => line.slice(minIndent)).join("\n");
  }
}
