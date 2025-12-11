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

export interface AgentConfig {
  id: string;
  maxSteps?: number;
  model?: ModelAdapter;
  temperature?: number;
  maxTokens?: number;
}

export class AgentCore {
  private context: any[] = [];
  private model: ModelAdapter;
  constructor(private cfg: AgentConfig, private eventBus: EventBus, private toolEngine: ToolEngine) {
    this.model = cfg.model ?? new MockAdapter();
  }

  async run(userInput: string) {
    this.eventBus.emit("AgentStartEvent", { agentId: this.cfg.id, userInput });
    const plan = simplePlanner(userInput);
    this.context.push({ role: "system", plan });
    let step = 0;
    while (step < (this.cfg.maxSteps ?? 20)) {
      this.eventBus.emit("AgentStepEvent", { agentId: this.cfg.id, step });
      // build prompt: include last tool results + planner hint
      const hint = plan.steps[0]?.hint ?? "";
      const prompt = `${userInput}\nPLAN_HINT:${hint}\nCONTEXT:${JSON.stringify(this.context)}`;
      
      // Build tools list for model
      const tools = this.toolEngine.list().map(tool => ({
        type: "function" as const,
        function: {
          name: tool.id,
          description: tool.description || tool.name,
          parameters: tool.schema || {},
        },
      }));

      // ask model
      const resp = await this.model.generate(prompt, {
        temperature: this.cfg.temperature ?? 0.0,
        max_tokens: this.cfg.maxTokens ?? 2048,
        tools: tools.length > 0 ? tools : undefined,
      });
      this.eventBus.emit("ModelResponseEvent", { agentId: this.cfg.id, resp });
      if (resp.type === "final") {
        this.eventBus.emit("AgentFinishEvent", { agentId: this.cfg.id, answer: resp.content });
        return { ok: true, answer: resp.content };
      } else if (resp.type === "tool" && resp.tool) {
        // call tool
        const result = await this.toolEngine.invoke(resp.tool, resp.arguments);
        // append tool result to context so next iteration sees it
        this.context.push({ role: "tool", tool: resp.tool, args: resp.arguments, result });
        // simple success check: if tool wrote a file, finish
        if (resp.tool === "fs.write" && result.ok) {
          this.eventBus.emit("AgentFinishEvent", { agentId: this.cfg.id, answer: "Write successful." });
          return { ok: true, answer: "Write successful.", result };
        }
      } else {
        // unrecognized output
        this.eventBus.emit("ModelResponseEvent", { agentId: this.cfg.id, resp });
      }
      step++;
    }
    const err = { ok: false, message: "max steps exceeded" };
    this.eventBus.emit("AgentFinishEvent", { agentId: this.cfg.id, error: err });
    return err;
  }
}

