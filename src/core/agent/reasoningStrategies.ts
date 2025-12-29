/**
 * Reasoning Strategies for Arium 0.2.0
 * Multiple reasoning approaches for AgentCore
 *
 * Author: Bogdan Marcen & ChatGPT 5.1
 */

import { EventBus } from "../eventBus";
import { AgentCore } from "./agentCore";
import { ToolEngine } from "../tool-engine";
import { ModelAdapter } from "../models/adapter";

/**
 * Reasoning strategy types
 */
export type ReasoningStrategyType = "react" | "plan_execute" | "tool_first" | "minimal";

/**
 * Base reasoning strategy interface
 */
export interface ReasoningStrategy {
  type: ReasoningStrategyType;
  name: string;
  description: string;

  /**
   * Execute the reasoning strategy
   */
  execute(
    agent: any, // AgentCore type would go here
    input: string,
    context: any[],
    tools: ToolEngine,
    model: ModelAdapter
  ): Promise<{
    output: string;
    steps: any[];
    usedTools: string[];
    metrics: {
      executionTime: number;
      modelCalls: number;
      toolCalls: number;
    };
  }>;

  /**
   * Check if this strategy can handle the current task
   */
  canHandle(taskDescription: string): boolean;

  /**
   * Get fallback strategy if this one fails
   */
  getFallbackStrategy(): ReasoningStrategyType;
}

/**
 * ReAct (Reason + Act) Strategy
 * Alternates between reasoning and acting
 */
export class ReactStrategy implements ReasoningStrategy {
  type: ReasoningStrategyType = "react";
  name = "ReAct";
  description = "Alternates between reasoning and acting - good for complex tasks";

  async execute(
    agent: any, // AgentCore type would go here
    input: string,
    context: any[],
    tools: ToolEngine,
    model: ModelAdapter
  ): Promise<{
    output: string;
    steps: any[];
    usedTools: string[];
    metrics: {
      executionTime: number;
      modelCalls: number;
      toolCalls: number;
    };
  }> {
    const startTime = Date.now();
    let modelCalls = 0;
    let toolCalls = 0;
    const steps: any[] = [];
    const usedTools: string[] = [];

    let currentInput = input;
    let maxSteps = agent.cfg?.maxSteps || 10;
    let stepCount = 0;

    while (stepCount < maxSteps) {
      stepCount++;

      // Reasoning step
      const reasoningResult = await model.generate({
        prompt: `Task: ${currentInput}\n\nContext: ${JSON.stringify(context)}\n\nReason about what to do next:`,
        context: context,
      });

      modelCalls++;

      if (!reasoningResult.ok) {
        throw new Error("Reasoning failed: " + reasoningResult.error.message);
      }

      const reasoning = reasoningResult.value.content || "No reasoning provided";

      // Action step
      const actionResult = await model.generate({
        prompt: `Reasoning: ${reasoning}\n\nAvailable tools: ${JSON.stringify(
          tools.list().map((t) => t.name)
        )}\n\nDecide what action to take:`,
        context: [...context, { role: "reasoning", content: reasoning }],
      });

      modelCalls++;

      if (!actionResult.ok) {
        throw new Error("Action planning failed: " + actionResult.error.message);
      }

      const action = actionResult.value;

      steps.push({
        step: stepCount,
        reasoning,
        action: action.content,
        type: "react",
      });

      // Check if we should use a tool
      if (action.type === "tool" && action.tool) {
        const toolResult = await tools.invoke(action.tool, action.arguments || {}, {
          id: agent.cfg?.id || "unknown",
        });

        toolCalls++;
        usedTools.push(action.tool);

        if (!toolResult.ok) {
          steps.push({
            step: stepCount,
            toolError: toolResult.error,
            type: "tool_error",
          });
          break;
        }

        context.push({
          role: "tool_result",
          content: JSON.stringify(toolResult.data),
          tool: action.tool,
        });

        steps.push({
          step: stepCount,
          toolResult: toolResult.data,
          type: "tool_result",
        });

        // Check if tool result completes the task
        const completionCheck = await model.generate({
          prompt: `Tool result: ${JSON.stringify(
            toolResult.data
          )}\n\nIs the task complete? Answer YES or NO:`,
          context: context,
        });

        modelCalls++;

        if (completionCheck.ok && completionCheck.value.content?.toUpperCase().includes("YES")) {
          steps.push({
            step: stepCount,
            completed: true,
            type: "completion",
          });
          break;
        }
      } else {
        // Direct response
        steps.push({
          step: stepCount,
          response: action.content,
          type: "response",
        });
        break;
      }
    }

    const executionTime = Date.now() - startTime;

    // Emit strategy changed event if this is a fallback
    agent.eventBus?.emit("strategy_changed" as any, {
      strategy: this.type,
      timestamp: Date.now(),
    });

    return {
      output: steps[steps.length - 1]?.response || "Task completed",
      steps,
      usedTools,
      metrics: {
        executionTime,
        modelCalls,
        toolCalls,
      },
    };
  }

  canHandle(taskDescription: string): boolean {
    // ReAct is good for complex, multi-step tasks
    const complexIndicators = [
      "complex",
      "multi-step",
      "detailed",
      "analysis",
      "reasoning",
    ];
    return complexIndicators.some((indicator) =>
      taskDescription.toLowerCase().includes(indicator)
    );
  }

  getFallbackStrategy(): ReasoningStrategyType {
    return "minimal"; // Fall back to minimal strategy
  }
}

/**
 * Plan-and-Execute Strategy
 * First creates a plan, then executes it
 */
export class PlanExecuteStrategy implements ReasoningStrategy {
  type: ReasoningStrategyType = "plan_execute";
  name = "Plan & Execute";
  description = "Creates a plan first, then executes it step by step";

  async execute(
    agent: any,
    input: string,
    context: any[],
    tools: ToolEngine,
    model: ModelAdapter
  ): Promise<{
    output: string;
    steps: any[];
    usedTools: string[];
    metrics: {
      executionTime: number;
      modelCalls: number;
      toolCalls: number;
    };
  }> {
    const startTime = Date.now();
    let modelCalls = 0;
    let toolCalls = 0;
    const steps: any[] = [];
    const usedTools: string[] = [];

    // Planning phase
    const planResult = await model.generate({
      prompt: `Create a step-by-step plan to solve this task:\n\nTask: ${input}\n\nContext: ${JSON.stringify(context)}\n\nAvailable tools: ${JSON.stringify(
        tools.list().map((t) => ({ name: t.name, description: t.description }))
      )}\n\nPlan:`,
      context: context,
    });

    modelCalls++;

    if (!planResult.ok) {
      throw new Error("Planning failed: " + planResult.error.message);
    }

    const plan = planResult.value.content || "No plan created";

    steps.push({
      type: "plan",
      plan,
    });

    // Execution phase
    const executionResult = await model.generate({
      prompt: `Execute this plan:\n\nPlan: ${plan}\n\nTask: ${input}\n\nContext: ${JSON.stringify(context)}\n\nExecute step by step:`,
      context: [...context, { role: "planner", content: plan }],
    });

    modelCalls++;

    if (!executionResult.ok) {
      throw new Error("Execution failed: " + executionResult.error.message);
    }

    const execution = executionResult.value;

    // Check if tools need to be used
    if (execution.type === "tool" && execution.tool) {
      const toolResult = await tools.invoke(execution.tool, execution.arguments || {}, {
        id: agent.cfg?.id || "unknown",
      });

      toolCalls++;
      usedTools.push(execution.tool);

      if (!toolResult.ok) {
        throw new Error("Tool execution failed: " + toolResult.error?.message);
      }

      steps.push({
        type: "tool_execution",
        tool: execution.tool,
        result: toolResult.data,
      });

      return {
        output: JSON.stringify(toolResult.data),
        steps,
        usedTools,
        metrics: {
          executionTime: Date.now() - startTime,
          modelCalls,
          toolCalls,
        },
      };
    }

    steps.push({
      type: "final_response",
      response: execution.content,
    });

    // Emit strategy changed event
    agent.eventBus?.emit("strategy_changed" as any, {
      strategy: this.type,
      timestamp: Date.now(),
    });

    return {
      output: execution.content || "Task completed",
      steps,
      usedTools,
      metrics: {
        executionTime: Date.now() - startTime,
        modelCalls,
        toolCalls,
      },
    };
  }

  canHandle(taskDescription: string): boolean {
    // Plan-and-execute is good for tasks requiring planning
    const planningIndicators = [
      "plan",
      "strategy",
      "approach",
      "methodology",
      "step-by-step",
    ];
    return planningIndicators.some((indicator) =>
      taskDescription.toLowerCase().includes(indicator)
    );
  }

  getFallbackStrategy(): ReasoningStrategyType {
    return "react"; // Fall back to ReAct strategy
  }
}

/**
 * Tool-First Strategy
 * Immediately uses tools when available
 */
export class ToolFirstStrategy implements ReasoningStrategy {
  type: ReasoningStrategyType = "tool_first";
  name = "Tool-First";
  description = "Immediately uses tools when available - good for tool-heavy tasks";

  async execute(
    agent: any,
    input: string,
    context: any[],
    tools: ToolEngine,
    model: ModelAdapter
  ): Promise<{
    output: string;
    steps: any[];
    usedTools: string[];
    metrics: {
      executionTime: number;
      modelCalls: number;
      toolCalls: number;
    };
  }> {
    const startTime = Date.now();
    let modelCalls = 0;
    let toolCalls = 0;
    const steps: any[] = [];
    const usedTools: string[] = [];

    const availableTools = tools.list();

    if (availableTools.length === 0) {
      // No tools available, use minimal strategy
      const result = await model.generate({
        prompt: `Solve this task:\n\nTask: ${input}\n\nContext: ${JSON.stringify(context)}`,
        context: context,
      });

      modelCalls++;

      if (!result.ok) {
        throw new Error("Task execution failed: " + result.error.message);
      }

      return {
        output: result.value.content || "Task completed",
        steps: [{ type: "direct_response", response: result.value.content }],
        usedTools: [],
        metrics: {
          executionTime: Date.now() - startTime,
          modelCalls,
          toolCalls,
        },
      };
    }

    // Use tools first
    for (const tool of availableTools) {
      const toolDecision = await model.generate({
        prompt: `Should I use the ${tool.name} tool for this task?\n\nTask: ${input}\n\nTool description: ${tool.description}\n\nContext: ${JSON.stringify(context)}\n\nAnswer YES or NO:`,
        context: context,
      });

      modelCalls++;

      if (!toolDecision.ok) {
        continue;
      }

      if (toolDecision.value.content?.toUpperCase().includes("YES")) {
        const toolResult = await tools.invoke(tool.id, {}, { id: agent.cfg?.id || "unknown" });

        toolCalls++;
        usedTools.push(tool.id);

        steps.push({
          type: "tool_usage",
          tool: tool.id,
          result: toolResult,
        });

        if (toolResult.ok) {
          return {
            output: JSON.stringify(toolResult.data),
            steps,
            usedTools,
            metrics: {
              executionTime: Date.now() - startTime,
              modelCalls,
              toolCalls,
            },
          };
        }
      }
    }

    // If no tools were used successfully, use direct approach
    const finalResult = await model.generate({
      prompt: `Solve this task:\n\nTask: ${input}\n\nContext: ${JSON.stringify(context)}\n\nNo suitable tools found, provide direct answer:`,
      context: context,
    });

    modelCalls++;

    if (!finalResult.ok) {
      throw new Error("Final execution failed: " + finalResult.error.message);
    }

    steps.push({
      type: "final_response",
      response: finalResult.value.content,
    });

    // Emit strategy changed event
    agent.eventBus?.emit("strategy_changed" as any, {
      strategy: this.type,
      timestamp: Date.now(),
    });

    return {
      output: finalResult.value.content || "Task completed",
      steps,
      usedTools,
      metrics: {
        executionTime: Date.now() - startTime,
        modelCalls,
        toolCalls,
      },
    };
  }

  canHandle(taskDescription: string): boolean {
    // Tool-first is good for tasks mentioning specific tools or actions
    const toolIndicators = [
      "tool",
      "calculate",
      "compute",
      "fetch",
      "retrieve",
      "process",
      "analyze",
    ];
    return toolIndicators.some((indicator) =>
      taskDescription.toLowerCase().includes(indicator)
    );
  }

  getFallbackStrategy(): ReasoningStrategyType {
    return "minimal"; // Fall back to minimal strategy
  }
}

/**
 * Minimal Strategy
 * Simple, direct approach with minimal reasoning
 */
export class MinimalStrategy implements ReasoningStrategy {
  type: ReasoningStrategyType = "minimal";
  name = "Minimal";
  description = "Simple, direct approach - good for straightforward tasks";

  async execute(
    agent: any,
    input: string,
    context: any[],
    tools: ToolEngine,
    model: ModelAdapter
  ): Promise<{
    output: string;
    steps: any[];
    usedTools: string[];
    metrics: {
      executionTime: number;
      modelCalls: number;
      toolCalls: number;
    };
  }> {
    const startTime = Date.now();
    let modelCalls = 0;
    let toolCalls = 0;
    const steps: any[] = [];
    const usedTools: string[] = [];

    // Direct approach
    const result = await model.generate({
      prompt: `Solve this task directly:\n\nTask: ${input}\n\nContext: ${JSON.stringify(context)}\n\nProvide a concise answer:`,
      context: context,
    });

    modelCalls++;

    if (!result.ok) {
      throw new Error("Task execution failed: " + result.error.message);
    }

    steps.push({
      type: "direct_response",
      response: result.value.content,
    });

    // Emit strategy changed event
    agent.eventBus?.emit("strategy_changed" as any, {
      strategy: this.type,
      timestamp: Date.now(),
    });

    return {
      output: result.value.content || "Task completed",
      steps,
      usedTools,
      metrics: {
        executionTime: Date.now() - startTime,
        modelCalls,
        toolCalls,
      },
    };
  }

  canHandle(taskDescription: string): boolean {
    // Minimal strategy is good for simple, direct tasks
    const simpleIndicators = [
      "simple",
      "quick",
      "direct",
      "straightforward",
      "easy",
    ];
    return simpleIndicators.some((indicator) =>
      taskDescription.toLowerCase().includes(indicator)
    );
  }

  getFallbackStrategy(): ReasoningStrategyType {
    return "minimal"; // Minimal strategy is the final fallback
  }
}

/**
 * Strategy Factory
 */
export class StrategyFactory {
  static createStrategy(
    type: ReasoningStrategyType,
    eventBus: EventBus
  ): ReasoningStrategy {
    switch (type) {
      case "react":
        return new ReactStrategy();
      case "plan_execute":
        return new PlanExecuteStrategy();
      case "tool_first":
        return new ToolFirstStrategy();
      case "minimal":
        return new MinimalStrategy();
      default:
        throw new Error(`Unknown strategy type: ${type}`);
    }
  }

  static getAllStrategies(): ReasoningStrategyType[] {
    return ["react", "plan_execute", "tool_first", "minimal"];
  }

  static selectBestStrategy(
    taskDescription: string,
    availableTools: number
  ): ReasoningStrategyType {
    // Simple heuristic-based selection
    if (availableTools > 2) {
      return "tool_first";
    }

    if (taskDescription.length > 200) {
      return "plan_execute";
    }

    if (taskDescription.includes("reason") || taskDescription.includes("analyze")) {
      return "react";
    }

    return "minimal";
  }
}