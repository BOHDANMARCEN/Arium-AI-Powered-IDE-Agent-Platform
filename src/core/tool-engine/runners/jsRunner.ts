/**
 * Sandboxed JavaScript Runner
 * Executes JavaScript tools in a secure isolated environment using VM2
 * 
 * Security Features:
 * - STRICT sandbox: no dangerous globals (process, Buffer, require)
 * - Static code validation to prevent obvious attacks
 * - Timeout protection
 * - Result sanitization
 * 
 * Author: Bogdan Marcen & ChatGPT 5.1
 */

import { NodeVM, VMScript } from "vm2";
import { ToolRunner } from "../index";
import { EventBus } from "../../eventBus";
import { Result, ok, err } from "../../utils/result";
import { TimeoutError, ToolExecutionError } from "../../errors/standardErrors";

export interface JsRunnerConfig {
  timeoutMs?: number; // milliseconds
  memoryLimitMb?: number; // megabytes (pseudo-limit, for monitoring)
  allowedBuiltins?: string[]; // allowed builtin modules if needed
}

// Forbidden patterns that should never appear in user code
// As per Phase 1.5: Remove Buffer, process, require, global, Function, eval, Proxy
const FORBIDDEN_PATTERNS = [
  /(child_process|spawn|exec|fork|process\.)/i,
  /require\(['`"].*['`"]\)/i,
  /while\s*\(true\)/i,
  /eval\s*\(/i,
  /Function\s*\(/i,
  /Buffer\./i,
  /fs\./i,
  /os\./i,
  /\bglobal\s*[=\.]/i, // global assignment or access
  /\bProxy\s*\(/i, // Proxy constructor
  /\bReflect\s*\./i, // Reflect API
  /new\s+Function\s*\(/i, // new Function()
];

export class JSRunner {
  private options: Required<JsRunnerConfig>;

  constructor(opts?: JsRunnerConfig) {
    this.options = {
      timeoutMs: opts?.timeoutMs ?? 5000, // 5 seconds default (Phase 1.5 requirement)
      memoryLimitMb: opts?.memoryLimitMb ?? 64,
      allowedBuiltins: opts?.allowedBuiltins ?? [],
    };
  }

  /**
   * Static code validation - check for dangerous patterns before execution
   * Logs forbidden API access attempts for security monitoring
   */
  private validateCode(code: string, eventBus?: EventBus): void {
    // Check code size
    if (code.length > 20_000) {
      throw new Error("Tool code too large (max 20KB)");
    }

    // Check for forbidden patterns and log violations
    for (const pattern of FORBIDDEN_PATTERNS) {
      if (pattern.test(code)) {
        const patternStr = pattern.toString();
        
        // Log forbidden API access attempt
        if (eventBus) {
          eventBus.emit("SecurityEvent", {
            type: "forbidden_api_access",
            pattern: patternStr,
            timestamp: Date.now(),
          });
        }
        
        throw new Error(`Prohibited pattern detected: ${patternStr}`);
      }
    }
  }

  /**
   * Create a strict VM instance with minimal permissions
   * STRICT sandbox: no globals passed, no console, no Buffer, no require, no global, no Proxy
   * As per Phase 1.5: Remove Buffer, process, require, global, Function, eval, Proxy
   */
  private createVM(eventBus: EventBus, args: Record<string, unknown>): NodeVM {
    return new NodeVM({
      console: "off", // Disable console access to prevent process.stdout access
      sandbox: {
        // Only explicitly safe globals - NO Buffer, process, require, global, Proxy
        args,
        eventBus: {
          // Limited event bus access - only emit, not full access
          emit: (type: string, payload: unknown) => {
            eventBus.emit(type as any, payload);
          },
        },
        // Explicitly exclude dangerous globals
        // Buffer, process, require, global, Proxy are NOT in sandbox
      },
      require: {
        external: false, // No external modules
        builtin: this.options.allowedBuiltins, // Only explicitly allowed builtins
        root: "./", // No access to fs through require
        mock: {
          // Mock dangerous modules to prevent access
          buffer: {},
          process: {},
          fs: {},
          os: {},
          child_process: {},
        },
      },
      wrapper: "none",
      timeout: this.options.timeoutMs, // 5000ms default
      eval: false, // Disable eval
      wasm: false, // Disable WebAssembly
      // Note: VM2 doesn't support direct memory limits, but we can monitor
      // For production, consider using worker threads with --max-old-space-size
    });
  }

  createRunner(code: string, eventBus: EventBus): ToolRunner {
    return async (args: Record<string, unknown>): Promise<Result<any>> => {
      try {
        // Validate code before execution (with eventBus for logging)
        this.validateCode(code, eventBus);

        // Create strict VM
        const vm = this.createVM(eventBus, args);

        // Setup timeout promise
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => {
            reject(new TimeoutError(`Execution timed out after ${this.options.timeoutMs}ms`));
          }, this.options.timeoutMs);
        });

        // Wrap code in async function wrapper
        const wrappedCode = `
          (async function() {
            ${code}
            
            // Try to call exported function or default export
            if (typeof module !== 'undefined' && module.exports) {
              if (typeof module.exports.default === 'function') {
                return await module.exports.default(args);
              }
              if (typeof module.exports === 'function') {
                return await module.exports(args);
              }
            }
            
            if (typeof run === 'function') {
              return await run(args);
            }
            
            throw new Error('No valid function found. Expected: async function run(args) {...} or function run(args) {...}');
          })()
        `;

        const script = new VMScript(wrappedCode, "user-code.js");
        
        // Execute with timeout
        const result = await Promise.race([
          vm.run(script, "user-code.js"),
          timeoutPromise
        ]);

        // Sanitize result - ensure it's JSON-safe (no functions, circular refs, etc.)
        const sanitized = this.sanitizeResult(result);

        // Normalize result format
        if (sanitized && typeof sanitized === "object") {
          if ("ok" in sanitized) {
            return sanitized;
          }
          // Wrap non-standard result
          return ok(sanitized);
        }

        return ok(sanitized);
      } catch (err: unknown) {
        // Log sanitized error (no stack traces with sensitive paths)
        if (err instanceof TimeoutError) {
          return err(err);
        }
        
        const errorMessage = err instanceof Error ? err.message : String(err);
        return err(new ToolExecutionError(errorMessage));
      }
    };
  }

  /**
   * Sanitize result to ensure it's JSON-safe
   * Removes functions, circular references, and other non-serializable data
   */
  private sanitizeResult(result: unknown): unknown {
    try {
      // Use JSON serialization to ensure result is safe
      return JSON.parse(JSON.stringify(result));
    } catch {
      // If serialization fails, return a safe representation
      if (result === null || result === undefined) {
        return result;
      }
      if (typeof result === "string" || typeof result === "number" || typeof result === "boolean") {
        return result;
      }
      // For complex objects that can't be serialized, return a safe representation
      return { _sanitized: true, type: typeof result };
    }
  }

  /**
   * Validate JavaScript code before execution
   * Checks both syntax and security patterns
   */
  validate(code: string): { valid: boolean; error?: string } {
    try {
      // Check for forbidden patterns first
      this.validateCode(code);

      // Basic syntax check
      new Function(code);
      return { valid: true };
    } catch (error: unknown) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

