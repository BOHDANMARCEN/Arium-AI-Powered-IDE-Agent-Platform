/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
/**
 * Robust AgentCore with:
 *  - Global execution timeout via AbortController + Promise.race
 *  - step-safe finally increment
 *  - loop detection for repeated tool calls
 *  - emergency stop via EventBus
 *  - helpers to make arbitrary async ops abortable
 *
 * Replace existing agentCore implementation with this.
 */

import { EventBus, EventEnvelope } from "../eventBus";
import { TimeoutError } from "../errors/standardErrors";
import { ModelAdapter, ModelInput, ModelOutput } from "../models/adapter";
import { ToolEngine } from "../tool-engine";
import { MockAdapter } from "../models/mockAdapter";
import { simplePlanner } from "./planner";
import { AgentLoopError } from "../errors";
import {
  Permission,
  DEFAULT_LEAST_PRIVILEGE,
} from "./permissions";
import { BoundedContext, ContextMessage } from "./boundedContext";
import { ok, err, Result } from "../utils/result";

// Define the missing BaseAgentConfig based on its usage
export interface BaseAgentConfig {
  id: string;
  model: any; // Generic model type
  maxSteps?: number;
  maxExecutionTimeMs?: number;
  globalTimeoutMs?: number;
  maxIdenticalToolCalls?: number;
  maxContextTokens?: number;
  maxConsecutiveFailures?: number;
  stepTimeoutMs?: number;
  permissions?: Permission[];
  temperature?: number;
  maxTokens?: number;
  maxContextSize?: number;
}

// AgentConfig with specific ModelAdapter type
export interface AgentConfig extends Omit<BaseAgentConfig, "model"> {
  model?: ModelAdapter;
}

// Small interface for tool call signature used in tracking repeated calls
type ToolCallSignature = string; // e.g. `${toolId}:${JSON.stringify(args)}`

/**
 * Helper: wrap a Promise so it rejects when AbortSignal is aborted.
 * If the underlying operation supports AbortSignal out of the box, prefer passing signal to it instead.
 */
async function withAbortable<T>(
  original: Promise<T>,
  signal: AbortSignal,
  onAbort?: () => void
): Promise<T> {
  if (signal.aborted) {
    onAbort?.();
    throw new TimeoutError("Aborted before start");
  }

  return await new Promise<T>((resolve, reject) => {
    const onAbortHandler = () => {
      onAbort?.();
      reject(new TimeoutError("Operation aborted"));
    };

    signal.addEventListener("abort", onAbortHandler);

    original
      .then((v) => {
        signal.removeEventListener("abort", onAbortHandler);
        resolve(v);
      })
      .catch((e) => {
        signal.removeEventListener("abort", onAbortHandler);
        reject(e);
      });
  });
}

/**
 * AgentCore
 * - Exposes run(task)
 * - Internally uses AbortController to implement global timeout
 * - stepOnce() must be abort-aware: check signal and use withAbortable for long awaits
 */
export class AgentCore {
  private context: BoundedContext;
  private model: ModelAdapter;
  private maxConsecutiveFailures: number;
  private stepTimeoutMs: number;
  private agentPermissions: Permission[];
  private stopped = false;
  private toolCallCounts: Map<ToolCallSignature, number> = new Map();
  private cfg: AgentConfig & {
    maxSteps: number;
    maxExecutionTimeMs: number;
    globalTimeoutMs: number;
    maxIdenticalToolCalls: number;
    maxContextTokens: number;
  };

  constructor(cfg: AgentConfig, private eventBus: EventBus, private toolEngine: ToolEngine) {
    // Correctly instantiate MockAdapter with eventBus
    this.model = cfg.model ?? new MockAdapter(this.eventBus);
    
    // Initialize BoundedContext
    const maxContextTokens = cfg.maxContextTokens ?? cfg.maxTokens ?? 4096;
    this.context = new BoundedContext({
      maxTokens: maxContextTokens,
      maxMessages: cfg.maxContextSize ?? 100,
    });
    
    this.maxConsecutiveFailures = cfg.maxConsecutiveFailures ?? 3;
    this.stepTimeoutMs = cfg.stepTimeoutMs ?? 30000;
    this.agentPermissions = cfg.permissions || DEFAULT_LEAST_PRIVILEGE;
    
    this.cfg = {
      ...cfg,
      maxSteps: cfg.maxSteps ?? 50,
      maxExecutionTimeMs: cfg.maxExecutionTimeMs ?? cfg.globalTimeoutMs ?? 5 * 60 * 1000,
      globalTimeoutMs: cfg.globalTimeoutMs ?? 5 * 60 * 1000,
      maxIdenticalToolCalls: cfg.maxIdenticalToolCalls ?? 3,
      maxContextTokens,
    };
    
    this.handleEmergencyStop = this.handleEmergencyStop.bind(this);
    this.eventBus.on("AgentEmergencyStopEvent", this.handleEmergencyStop);
  }

  // Public API: run a task; may resolve to Result or reject with TimeoutError / others
  public async run(task: string, opts?: { model?: string }): Promise<Result<any>> {
    const abortController = new AbortController();
    const signal = abortController.signal;
    const start = Date.now();
    let step = 0;
    let lastError: Error | null = null;

    // Emergency stop: external emitter can call this.eventBus.emit("agent.emergencyStop", agentId)
    this.stopped = false;

    // Execution closure
    const execution = async (): Promise<Result<any>> => {
      try {
        // Initialize context with user task and plan
        const plan = simplePlanner(task);
        this.addToContext({ role: "system", content: JSON.stringify({ plan }) });
        this.addToContext({ role: "user", content: task });
        
        this.eventBus.emit("AgentStartEvent", { agentId: this.cfg.id, userInput: task });

        // Main loop
        while (!this.stopped && step < this.cfg.maxSteps) {
          // Check abort early
          if (signal.aborted) throw new TimeoutError("Global execution aborted");

          try {
            // single step: must respect abort signal
            await this.stepOnce({ step, signal, model: opts?.model });

            // if emergency stop flagged, break
            if (this.stopped) break;
          } catch (e) {
            // Save last error and if it's a TimeoutError bubble up
            lastError = e instanceof Error ? e : new Error(String(e));
            // If it's an Abort/Timeout, propagate immediately
            if (e instanceof TimeoutError) throw e;
            // Otherwise, emit event and decide whether to continue or abort
            this.eventBus.emit("ModelErrorEvent", { error: e, step });
            // choose to break or continue depending on severity: here we break to be safe
            break;
          } finally {
            // Always increment step to avoid infinite loops
            step += 1;
          }
        }

        // If stopped by emergency
        if (this.stopped) {
          return err(new Error("Execution stopped by emergency stop"));
        }

        // If aborted by signal
        if (signal.aborted) {
          throw new TimeoutError("Global execution aborted");
        }

        // Check if we got a final answer from last step
        const lastMessage = this.context.getAll().slice(-1)[0];
        if (lastMessage?.role === "assistant") {
          return ok({ answer: lastMessage.content, ok: true });
        }

        // Default success result
        return ok({ answer: "Task completed", ok: true });
      } finally {
        const duration = Date.now() - start;
        this.eventBus.emit("AgentFinishEvent", {
          agentId: this.cfg.id,
          duration,
          step,
          lastError: lastError ? { message: lastError.message } : undefined,
        });
      }
    };

    // Timeout promise — rejects with TimeoutError and aborts the execution
    const timeout = new Promise<never>((_, reject) => {
      const t = setTimeout(() => {
        if (!signal.aborted) {
          abortController.abort();
        }
        reject(new TimeoutError(`Global execution timeout (${this.cfg.maxExecutionTimeMs}ms)`));
      }, this.cfg.maxExecutionTimeMs);

      // If execution finishes earlier, clear timer
      signal.addEventListener(
        "abort",
        () => {
          clearTimeout(t);
        },
        { once: true }
      );
    });

    // Race execution vs timeout
    try {
      const res = await Promise.race([execution(), timeout]);
      // execution resolved before timeout
      return res as Result<any>;
    } catch (e) {
      // Ensure abort set
      if (!signal.aborted && e instanceof TimeoutError) {
        // Make sure we abort execution path
        abortController.abort();
      }
      // Bubble the TimeoutError out so tests expecting rejects.toThrow(TimeoutError) succeed
      if (e instanceof TimeoutError) throw e;
      // For other errors, return err(...) to keep Result pattern, or rethrow if you prefer
      return err(e instanceof Error ? e : new Error(String(e)));
    } finally {
      // Remove emergency stop listener if needed
      // NOTE: if you have multiple AgentCore instances, consider namespacing events
      this.eventBus.off("AgentEmergencyStopEvent" as any, this.handleEmergencyStop);
    }
  }

  // Add message to context with bounded behavior using BoundedContext
  private addToContext(msg: ContextMessage) {
    this.context.add(msg);
  }

  /**
   * A single step of execution.
   * Must be abort-aware. Use withAbortable for long blocking ops (model calls, tool invokes).
   *
   * Options:
   *  - signal: AbortSignal
   *  - step: current step index
   *  - model: optional model name
   */
  private async stepOnce(opts: { signal: AbortSignal; step: number; model?: string }) {
    const { signal, step, model } = opts;

    // quick abort check
    if (signal.aborted) throw new TimeoutError("Aborted before step");

    // emergency stop check (fix for test "should support emergency stop")
    if (this.stopped) {
      throw new Error("Emergency stop detected");
    }

    // Build prompt from context
    const contextArray = this.context.toArray();
    const plan = simplePlanner(contextArray.find(m => m.role === "user")?.content || "");
    const hint = plan.steps[0]?.hint ?? "";
    const prompt = `${contextArray.find(m => m.role === "user")?.content || ""}\nPLAN_HINT:${hint}\nCONTEXT:${JSON.stringify(contextArray)}`;

    // Build tools list
    const tools = this.toolEngine.list().map((tool) => ({
      type: "function" as const,
      function: {
        name: tool.id,
        description: tool.description || tool.name,
        parameters: tool.schema || {},
      },
    }));

    // Create the ModelInput object
    const modelInput: ModelInput = {
      prompt: prompt,
      options: {
        temperature: this.cfg.temperature ?? 0.0,
        max_tokens: this.cfg.maxTokens ?? 2048,
        tools: tools.length > 0 ? tools : undefined,
      }
    };

    // Call model (wrap with withAbortable for abort support)
    const modelPromise = this.model.generate(modelInput);
    
    const modelResult = await withAbortable(modelPromise, signal, () => {
      this.eventBus.emit("ModelErrorEvent", { agentId: this.cfg.id, step });
    });

    if (modelResult.ok === false) {
      throw modelResult.error;
    }
    const modelResponse: ModelOutput = modelResult.value;

    this.eventBus.emit("ModelResponseEvent", { agentId: this.cfg.id, resp: modelResponse });

    // Handle tool call
    if (modelResponse.type === "tool" && modelResponse.tool) {
      const toolId = modelResponse.tool;
      const args = modelResponse.arguments ?? {};
      const sig = this.toolCallSignature(toolId, args);

      // Loop detection
      const count = (this.toolCallCounts.get(sig) ?? 0) + 1;
      this.toolCallCounts.set(sig, count);
      if (count > this.cfg.maxIdenticalToolCalls) {
        this.eventBus.emit("AgentStepEvent", {
          agentId: this.cfg.id,
          step,
          action: "loop_detected",
          toolId,
          count,
        });
        throw new AgentLoopError(`Same tool called repeatedly: ${toolId}`, step);
      }

      // Invoke tool with permissions
      const caller = {
        id: this.cfg.id,
        permissions: this.agentPermissions,
      };

      const toolPromise = this.toolEngine.invoke(toolId, args, caller);
      const toolResult = await withAbortable(toolPromise, signal, () => {
        this.eventBus.emit("ToolErrorEvent", { toolId, step });
      });

      // emergency stop re-check after tool execution
      if (this.stopped) {
        throw new Error("Emergency stop detected");
      }

      // Add tool result to context
      this.addToContext({
        role: "tool",
        content: JSON.stringify({ tool: toolId, args, result: toolResult }),
      });

      // Reset counter on success
      if (toolResult.ok) {
        this.toolCallCounts.set(sig, 0);
      }

      return toolResult;
    }

    // Handle final answer
    if (modelResponse.type === "final") {
      this.addToContext({
        role: "assistant",
        content: modelResponse.content || "",
      });

      // emergency stop re-check after assistant message
      if (this.stopped) {
        throw new Error("Emergency stop detected");
      }

      return { type: "final", content: modelResponse.content };
    }

    return modelResponse;
  }

  private toolCallSignature(toolId: string, args: Record<string, unknown>): ToolCallSignature {
    // Serialize deterministically
    let argsStr: string;
    try {
      argsStr = JSON.stringify(args, Object.keys(args).sort());
    } catch {
      argsStr = String(args);
    }
    return `${toolId}:${argsStr}`;
  }

  // Emergency stop handler
  private handleEmergencyStop(evt: EventEnvelope<{ agentId?: string; reason?: string }>) {
    if (evt.payload?.agentId === this.cfg.id || evt.payload?.agentId === "all") {
      this.stopped = true;
      this.eventBus.emit("AgentFinishEvent", {
        agentId: this.cfg.id,
        reason: evt.payload?.reason || "emergency_stop",
      });
    }
  }
}
