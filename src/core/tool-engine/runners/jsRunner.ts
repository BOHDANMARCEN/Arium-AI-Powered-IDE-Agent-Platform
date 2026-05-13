/**
 * Sandboxed JavaScript Runner
 *
 * This implementation uses Node's vm with strict validation to block
 * dangerous APIs. It is intentionally minimal and intended for controlled
 * tool execution.
 */

import vm from "vm";
import { ToolRunner } from "../index";
import { EventBus } from "../../eventBus";
import { ToolExecutionResult } from "../../types";

const MAX_CODE_SIZE = 20_000;

const FORBIDDEN_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /\bchild_process\b/i, reason: "child_process" },
  { pattern: /\bspawn\b/i, reason: "spawn" },
  { pattern: /\bexec\b/i, reason: "exec" },
  { pattern: /\bprocess\b/i, reason: "process" },
  { pattern: /\bBuffer\b/i, reason: "Buffer" },
  { pattern: /\brequire\s*\(/i, reason: "require" },
  { pattern: /\bglobal\b/i, reason: "global" },
  { pattern: /\bProxy\b/i, reason: "Proxy" },
  { pattern: /\bFunction\s*\(/i, reason: "Function" },
  { pattern: /\beval\s*\(/i, reason: "eval" },
  { pattern: /while\s*\(\s*true\s*\)/i, reason: "while(true)" },
];

export interface JsRunnerConfig {
  timeoutMs?: number;
  memoryLimitMb?: number;
}

export class JSRunner {
  public options: Required<JsRunnerConfig>;

  constructor(opts: JsRunnerConfig = {}) {
    this.options = {
      timeoutMs: opts.timeoutMs ?? 5000,
      memoryLimitMb: opts.memoryLimitMb ?? 64,
    };
  }

  createRunner(code: string, eventBus: EventBus): ToolRunner {
    try {
      this.validateCode(code, eventBus);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return async (): Promise<ToolExecutionResult> => ({
        ok: false,
        error: {
          message: `Prohibited: ${message}`,
          code: "forbidden_api_access",
        },
      });
    }

    return async (args: Record<string, unknown>): Promise<ToolExecutionResult> => {
      try {
        const sandbox: Record<string, unknown> = {
          module: { exports: {} },
          exports: {},
          require: undefined,
          process: undefined,
          Buffer: undefined,
          global: undefined,
          Proxy: undefined,
        };

        const context = vm.createContext(sandbox);
        const script = new vm.Script(code, { filename: "tool.js" });
        script.runInContext(context, { timeout: this.options.timeoutMs });

        const runFn =
          (context as { run?: unknown }).run ||
          (context.module as { exports?: { run?: unknown } })?.exports?.run ||
          (context.exports as { run?: unknown })?.run;

        if (typeof runFn !== "function") {
          return {
            ok: false,
            error: { message: "Tool code must export a run(args) function" },
          };
        }

        const result = await Promise.resolve(
          (runFn as (input: Record<string, unknown>) => unknown)(args)
        );

        if (
          result &&
          typeof result === "object" &&
          "ok" in (result as Record<string, unknown>)
        ) {
          return result as ToolExecutionResult;
        }

        return { ok: true, data: result };
      } catch (error) {
        return {
          ok: false,
          error: { message: error instanceof Error ? error.message : String(error) },
        };
      }
    };
  }

  validate(code: string): { valid: boolean; error?: string } {
    try {
      this.validateCode(code);
      return { valid: true };
    } catch (error) {
      return { valid: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  private validateCode(code: string, eventBus?: EventBus): void {
    if (code.length > MAX_CODE_SIZE) {
      this.emitForbiddenEvent(eventBus, "code_size_exceeded");
      throw new Error("Code exceeds 20KB limit");
    }

    for (const { pattern, reason } of FORBIDDEN_PATTERNS) {
      if (pattern.test(code)) {
        this.emitForbiddenEvent(eventBus, reason);
        throw new Error(`Forbidden API usage: ${reason}`);
      }
    }
  }

  private emitForbiddenEvent(eventBus: EventBus | undefined, reason: string) {
    if (!eventBus) return;
    eventBus.emit("SecurityEvent", {
      type: "forbidden_api_access",
      reason,
      timestamp: Date.now(),
    });
  }
}
