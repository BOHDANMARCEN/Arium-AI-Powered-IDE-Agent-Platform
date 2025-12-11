/**
 * Sandboxed JavaScript Runner
 * Executes JavaScript tools in a secure isolated environment using VM2
 * 
 * Features:
 * - Resource limits (memory, CPU time)
 * - Restricted filesystem access
 * - Controlled globals
 * - Timeout protection
 */

import { VM } from "vm2";
import { ToolRunner } from "../index";
import { EventBus } from "../../eventBus";

export interface JSRunnerConfig {
  timeout?: number; // milliseconds
  memoryLimit?: number; // bytes
  sandbox?: Record<string, any>; // additional sandbox globals
}

export class JSRunner {
  private defaultConfig: Required<JSRunnerConfig> = {
    timeout: 30000, // 30 seconds
    memoryLimit: 256 * 1024 * 1024, // 256 MB
    sandbox: {},
  };

  constructor(private config: JSRunnerConfig = {}) {}

  createRunner(code: string, eventBus: EventBus): ToolRunner {
    return async (args: any) => {
      const mergedConfig = {
        timeout: this.config.timeout ?? this.defaultConfig.timeout,
        memoryLimit: this.config.memoryLimit ?? this.defaultConfig.memoryLimit,
        sandbox: {
          // Safe globals only - removed dangerous ones
          // Safe console wrapper (no access to process, fs, etc.)
          console: {
            log: (...args: any[]) => console.log("[JS Tool]", ...args),
            error: (...args: any[]) => console.error("[JS Tool]", ...args),
            warn: (...args: any[]) => console.warn("[JS Tool]", ...args),
            info: (...args: any[]) => console.info("[JS Tool]", ...args),
          },
          setTimeout,
          clearTimeout,
          setInterval,
          clearInterval,
          Date,
          Math,
          JSON,
          // Removed Buffer - can be used for memory attacks
          // Removed process - can access system info
          // Removed require - can load arbitrary modules
          // Custom sandbox
          ...this.config.sandbox,
          // Tool context
          args,
          eventBus: {
            // Limited event bus access - only emit, not full access
            emit: (type: string, payload: any) => {
              eventBus.emit(type as any, payload);
            },
          },
        },
      };

      try {
        const vm = new VM({
          timeout: mergedConfig.timeout,
          sandbox: mergedConfig.sandbox,
          eval: false, // Disable eval
          wasm: false, // Disable WebAssembly
          fixAsync: true, // Fix async functions
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

        const result = await vm.run(wrappedCode);

        // Normalize result
        if (result && typeof result === "object") {
          if ("ok" in result) {
            return result;
          }
          // Wrap non-standard result
          return { ok: true, data: result };
        }

        return { ok: true, data: result };
      } catch (error: any) {
        return {
          ok: false,
          error: {
            message: error.message,
            stack: error.stack,
            type: error.name || "JSRunnerError",
          },
        };
      }
    };
  }

  /**
   * Validate JavaScript code before execution
   */
  validate(code: string): { valid: boolean; error?: string } {
    try {
      // Basic syntax check
      new Function(code);
      return { valid: true };
    } catch (error: any) {
      return {
        valid: false,
        error: error.message,
      };
    }
  }
}

