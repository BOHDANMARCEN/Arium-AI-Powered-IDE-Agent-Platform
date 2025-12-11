/**
 * Agent Core: simple reasoning loop.
 * - builds prompts from context and planner hints
 * - asks ModelAdapter
 * - if response.type === 'tool' -> calls ToolEngine
 * - appends results to context and continues until final
 */

import { EventBus } from "../eventBus";
import { ToolEngine } from "../tool-engine";
import { MockAdapter } from "../models/mockAdapter";
import { ModelAdapter, ToolSpec } from "../models/adapter";
import { simplePlanner } from "./planner";
import { AgentLoopError } from "../errors";

export interface AgentConfig {
  id: string;
  maxSteps?: number;
  model?: ModelAdapter;
  temperature?: number;
  maxTokens?: number;
  maxContextSize?: number; // Maximum number of context entries
  contextSummarizationThreshold?: number; // Summarize context after N entries
  maxConsecutiveFailures?: number; // Abort after N consecutive failures
  stepTimeoutMs?: number; // Timeout per step in milliseconds
  permissions?: string[]; // Agent permissions for tool execution
}

export class AgentCore {
  private context: any[] = [];
  private model: ModelAdapter;
  private maxContextSize: number;
  private summarizationThreshold: number;
  private maxConsecutiveFailures: number;
  private stepTimeoutMs: number;
  private agentPermissions: string[];

  constructor(private cfg: AgentConfig, private eventBus: EventBus, private toolEngine: ToolEngine) {
    this.model = cfg.model ?? new MockAdapter();
    this.maxContextSize = cfg.maxContextSize ?? 50; // Default: 50 entries
    this.summarizationThreshold = cfg.contextSummarizationThreshold ?? 30; // Summarize after 30 entries
    this.maxConsecutiveFailures = cfg.maxConsecutiveFailures ?? 3; // Default: 3 failures
    this.stepTimeoutMs = cfg.stepTimeoutMs ?? 30000; // Default: 30 seconds
    // Default agent permissions (agents have all permissions by default)
    this.agentPermissions = cfg.permissions || [
      "vfs.read",
      "vfs.write",
      "vfs.delete",
      "net.fetch",
      "process.execute",
      "python.execute",
      "js.execute",
    ];
  }

  /**
   * Summarize context to prevent unbounded growth
   */
  private summarizeContext() {
    if (this.context.length <= this.summarizationThreshold) {
      return;
    }

    // Keep first entry (system/plan) and last N entries
    const keepCount = Math.floor(this.maxContextSize / 2);
    const systemEntry = this.context[0];
    const recentEntries = this.context.slice(-keepCount);

    // Create summary entry
    const summarizedCount = this.context.length - keepCount - 1;
    const summaryEntry = {
      role: "system",
      type: "context_summary",
      message: `Previous ${summarizedCount} context entries summarized`,
      originalCount: this.context.length,
    };

    // Rebuild context: system + summary + recent
    this.context = [systemEntry, summaryEntry, ...recentEntries];

    this.eventBus.emit("AgentStepEvent", {
      agentId: this.cfg.id,
      action: "context_summarized",
      entriesRemoved: summarizedCount,
    });
  }

  async run(userInput: string) {
    this.eventBus.emit("AgentStartEvent", { agentId: this.cfg.id, userInput });
    const plan = simplePlanner(userInput);
    this.context.push({ role: "system", plan });
    
    let step = 0;
    let lastToolCall: string | null = null;
    let consecutiveToolFailures = 0;
    let consecutiveSameToolCalls = 0;
    const maxSteps = this.cfg.maxSteps ?? 20;

    while (step < maxSteps) {
      try {
        // Always increment step to prevent infinite loops
        step++;
        this.eventBus.emit("AgentStepEvent", { agentId: this.cfg.id, step });

        // Prevent context from growing unbounded
        if (this.context.length > this.maxContextSize) {
          this.summarizeContext();
        }

        // Build prompt: include last tool results + planner hint
        const hint = plan.steps[0]?.hint ?? "";
        const prompt = `${userInput}\nPLAN_HINT:${hint}\nCONTEXT:${JSON.stringify(this.context)}`;

        // Build tools list for model
        const tools = this.toolEngine.list().map((tool) => ({
          type: "function" as const,
          function: {
            name: tool.id,
            description: tool.description || tool.name,
            parameters: tool.schema || {},
          },
        }));

        // Ask model with timeout
        const resp = await Promise.race([
          this.model.generate(prompt, {
            temperature: this.cfg.temperature ?? 0.0,
            max_tokens: this.cfg.maxTokens ?? 2048,
            tools: tools.length > 0 ? tools : undefined,
          }),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("Step timeout")), this.stepTimeoutMs)
          ),
        ]);

        this.eventBus.emit("ModelResponseEvent", { agentId: this.cfg.id, resp });

        if (resp.type === "final") {
          this.eventBus.emit("AgentFinishEvent", { agentId: this.cfg.id, answer: resp.content });
          return { ok: true, answer: resp.content };
        } else if (resp.type === "tool" && resp.tool) {
          // Loop detection: check for repeated tool calls
          if (resp.tool === lastToolCall) {
            consecutiveSameToolCalls++;
            if (consecutiveSameToolCalls >= 3) {
              const error = new AgentLoopError(
                `Same tool called repeatedly: ${resp.tool}`,
                step
              );
              this.eventBus.emit("AgentFinishEvent", {
                agentId: this.cfg.id,
                error: { message: error.message, code: error.code },
              });
              throw error;
            }
          } else {
            consecutiveSameToolCalls = 0;
          }
          lastToolCall = resp.tool;

          // Call tool with agent permissions
          const caller = {
            id: this.cfg.id,
            permissions: this.agentPermissions,
          };

          let result;
          try {
            result = await this.toolEngine.invoke(resp.tool, resp.arguments, caller);
          } catch (error: any) {
            // Tool execution error - continue loop but track failure
            result = { ok: false, error: { message: error.message } };
            consecutiveToolFailures++;
          }

          // Check for consecutive failures
          if (!result.ok) {
            consecutiveToolFailures++;
            if (consecutiveToolFailures >= this.maxConsecutiveFailures) {
              const error = new AgentLoopError(
                `Too many consecutive failures: ${consecutiveToolFailures}`,
                step
              );
              this.eventBus.emit("AgentFinishEvent", {
                agentId: this.cfg.id,
                error: { message: error.message, code: error.code },
              });
              throw error;
            }
          } else {
            consecutiveToolFailures = 0; // Reset on success
          }

          // Append tool result to context so next iteration sees it
          this.context.push({ role: "tool", tool: resp.tool, args: resp.arguments, result });

          // Simple success check: if tool wrote a file, finish
          if (resp.tool === "fs.write" && result.ok) {
            this.eventBus.emit("AgentFinishEvent", {
              agentId: this.cfg.id,
              answer: "Write successful.",
            });
            return { ok: true, answer: "Write successful.", result };
          }
        } else {
          // Unrecognized output
          this.eventBus.emit("ModelResponseEvent", { agentId: this.cfg.id, resp });
        }
      } catch (error: any) {
        // Handle step timeout or other errors
        if (error.message === "Step timeout") {
          this.eventBus.emit("AgentStepEvent", {
            agentId: this.cfg.id,
            step,
            error: "Step timeout",
          });
          consecutiveToolFailures++;
          if (consecutiveToolFailures >= this.maxConsecutiveFailures) {
            const loopError = new AgentLoopError("Too many timeouts", step);
            this.eventBus.emit("AgentFinishEvent", {
              agentId: this.cfg.id,
              error: { message: loopError.message, code: loopError.code },
            });
            throw loopError;
          }
          continue; // Retry step
        }
        // Re-throw other errors (like AgentLoopError)
        throw error;
      }
    }

    const err = { ok: false, message: "max steps exceeded" };
    this.eventBus.emit("AgentFinishEvent", { agentId: this.cfg.id, error: err });
    return err;
  }
}

