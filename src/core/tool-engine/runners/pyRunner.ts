/**
 * Sandboxed Python Runner (DISABLED)
 * This feature is temporarily disabled for project stabilization.
 * It needs to be reviewed and re-implemented safely.
 */

import { ToolRunner, ToolExecutionContext } from "../index";
import { EventBus } from "../../eventBus";
import { ToolExecutionResult } from "../../types";

const DISABLED_ERROR_MESSAGE = "Python runner is temporarily disabled for stabilization. This feature requires a security and reliability review before re-enabling.";

export interface PyRunnerConfig {
  // This interface is kept for structural compatibility with ToolEngine.
}

export class PyRunner {
  constructor(private config: PyRunnerConfig = {}) {}

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

  async validate(code: string): Promise<{ valid: boolean; error?: string }> {
    // Immediately return an error when validation is attempted.
    return {
      valid: false,
      error: DISABLED_ERROR_MESSAGE,
    };
  }
}
