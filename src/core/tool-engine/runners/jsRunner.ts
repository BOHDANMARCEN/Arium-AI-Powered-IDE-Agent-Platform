/**
 * Sandboxed JavaScript Runner (DISABLED)
 *
 * This feature is currently disabled due to critical security vulnerabilities
 * discovered in the 'vm2' library. Do not re-enable until a secure
 * sandboxing mechanism has been implemented.
 */

import { ToolRunner, ToolExecutionContext } from "../index";
import { EventBus } from "../../eventBus";
import { ToolExecutionResult } from "../../types";

const DISABLED_ERROR_MESSAGE = "JavaScript runner is disabled due to a critical security vulnerability (vm2). This feature must be re-implemented with a secure sandbox before re-enabling.";

export interface JsRunnerConfig {
  // This interface is kept for structural compatibility with ToolEngine.
}

export class JSRunner {
  constructor(opts?: JsRunnerConfig) {
    // Constructor is kept for structural compatibility.
  }

  createRunner(code: string, eventBus: EventBus): ToolRunner {
    return async (args: Record<string, unknown>, ctx: ToolExecutionContext): Promise<ToolExecutionResult> => {
      // Immediately return an error when execution is attempted.
      return {
        ok: false,
        error: {
          message: DISABLED_ERROR_MESSAGE,
          code: "runner_disabled",
        }
      };
    };
  }

  validate(code: string): { valid: boolean; error?: string } {
    // Immediately return an error when validation is attempted.
    return {
      valid: false,
      error: DISABLED_ERROR_MESSAGE,
    };
  }
}

