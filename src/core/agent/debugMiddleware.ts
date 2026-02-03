/**
 * Debug Middleware for Arium 0.2.0
 * Collects execution metrics and telemetry
 *
 * Author: Bogdan Marcen & ChatGPT 5.1
 */

import { EventBus } from "../eventBus";
import { AgentCore } from "./agentCore";
import { ToolEngine } from "../tool-engine";
import { ModelAdapter } from "../models/adapter";

/**
 * Debug metrics interface
 */
export interface DebugMetrics {
  toolCalls: number;
  modelCalls: number;
  stepExecutionTimes: number[];
  contextSizes: {
    beforeCompression: number;
    afterCompression: number;
  }[];
  usedStopConditions: string[];
  totalExecutionTime: number;
  startTime: number;
  endTime?: number;
}

/**
 * Debug Middleware
 */
export class DebugMiddleware {
  private metrics: DebugMetrics;
  private eventBus: EventBus;

  constructor(eventBus: EventBus) {
    this.eventBus = eventBus;
    this.metrics = {
      toolCalls: 0,
      modelCalls: 0,
      stepExecutionTimes: [],
      contextSizes: [],
      usedStopConditions: [],
      totalExecutionTime: 0,
      startTime: Date.now(),
    };

    // Subscribe to relevant events
    this.setupEventListeners();
  }

  /**
   * Setup event listeners for metrics collection
   */
  private setupEventListeners(): void {
    // Tool invocation events
    this.eventBus.on("ToolInvocationEvent", (event: any) => {
      this.metrics.toolCalls++;
    });

    // Model response events
    this.eventBus.on("ModelResponseEvent", (event: any) => {
      this.metrics.modelCalls++;
    });

    // Agent step events
    this.eventBus.on("AgentStepEvent", (event: any) => {
      if (event.payload?.executionTime) {
        this.metrics.stepExecutionTimes.push(event.payload.executionTime);
      }
    });

    // Context compression events
    this.eventBus.on("ContextCompressionEvent", (event: any) => {
      this.metrics.contextSizes.push({
        beforeCompression: event.payload?.beforeSize || 0,
        afterCompression: event.payload?.afterSize || 0,
      });
    });

    // Stop condition events
    this.eventBus.on("StopConditionTriggered", (event: any) => {
      if (event.payload?.conditionType) {
        this.metrics.usedStopConditions.push(event.payload.conditionType);
      }
    });
  }

  /**
   * Wrap agent execution with debug metrics
   */
  async wrapAgentExecution(
    agent: any, // AgentCore type would go here
    initialInput: string,
    callback: (result: any) => void
  ): Promise<void> {
    this.metrics.startTime = Date.now();
    this.metrics.totalExecutionTime = 0;

    try {
      const startTime = Date.now();
      const result = await agent.run(initialInput);
      const endTime = Date.now();

      this.metrics.totalExecutionTime = endTime - startTime;
      this.metrics.endTime = endTime;

      // Emit debug metrics event
      this.eventBus.emit("DebugMetricsEvent" as any, {
        metrics: this.metrics,
        agentId: agent.id || 'unknown',
        timestamp: endTime,
      });

      callback(result);
    } catch (error) {
      this.metrics.endTime = Date.now();
      this.metrics.totalExecutionTime = this.metrics.endTime - this.metrics.startTime;

      // Emit error metrics event
      this.eventBus.emit("DebugMetricsEvent" as any, {
        metrics: this.metrics,
        agentId: agent.id || 'unknown',
        timestamp: this.metrics.endTime,
        error: (error as Error).message,
      });

      throw error;
    }
  }

  /**
   * Get current metrics snapshot
   */
  getMetrics(): DebugMetrics {
    return { ...this.metrics };
  }

  /**
   * Reset metrics
   */
  resetMetrics(): void {
    this.metrics = {
      toolCalls: 0,
      modelCalls: 0,
      stepExecutionTimes: [],
      contextSizes: [],
      usedStopConditions: [],
      totalExecutionTime: 0,
      startTime: Date.now(),
    };
  }

  /**
   * Calculate average step execution time
   */
  getAverageStepTime(): number | null {
    if (this.metrics.stepExecutionTimes.length === 0) return null;
    const sum = this.metrics.stepExecutionTimes.reduce((a, b) => a + b, 0);
    return sum / this.metrics.stepExecutionTimes.length;
  }

  /**
   * Calculate average context compression ratio
   */
  getAverageCompressionRatio(): number | null {
    if (this.metrics.contextSizes.length === 0) return null;
    const ratios = this.metrics.contextSizes.map(
      (size) => size.afterCompression / size.beforeCompression
    );
    const sum = ratios.reduce((a, b) => a + b, 0);
    return sum / ratios.length;
  }

  /**
   * Generate debug report
   */
  generateReport(): string {
    const avgStepTime = this.getAverageStepTime();
    const avgCompression = this.getAverageCompressionRatio();

    return `
=== Arium Debug Report ===
Generated: ${new Date().toISOString()}

Execution Metrics:
- Total Execution Time: ${this.metrics.totalExecutionTime}ms
- Tool Calls: ${this.metrics.toolCalls}
- Model Calls: ${this.metrics.modelCalls}
- Agent Steps: ${this.metrics.stepExecutionTimes.length}
- Average Step Time: ${avgStepTime !== null ? avgStepTime.toFixed(2) + 'ms' : 'N/A'}

Context Compression:
- Compression Events: ${this.metrics.contextSizes.length}
- Average Compression Ratio: ${avgCompression !== null ? (avgCompression * 100).toFixed(2) + '%' : 'N/A'}

Stop Conditions Used:
- ${this.metrics.usedStopConditions.length > 0 ? this.metrics.usedStopConditions.join(', ') : 'None'}

=== End Report ===
`;
  }

  /**
   * Create debug middleware wrapper for tool engine
   */
  static createToolEngineWrapper(toolEngine: ToolEngine, eventBus: EventBus): ToolEngine {
    // We'll create a proxy that wraps the invoke method
    const originalInvoke = toolEngine.invoke.bind(toolEngine);

    // Create a new ToolEngine instance with wrapped methods
    const wrappedEngine = new Proxy(toolEngine, {
      get(target, prop, receiver) {
        if (prop === 'invoke') {
          return async function (toolId: string, args: any, caller?: any) {
            const startTime = Date.now();
            try {
              const result = await originalInvoke(toolId, args, caller);
              const endTime = Date.now();

              eventBus.emit('ToolExecutionMetrics' as any, {
                toolId,
                executionTime: endTime - startTime,
                success: result.ok,
                timestamp: endTime,
              });

              return result;
            } catch (error) {
              const endTime = Date.now();
              eventBus.emit('ToolExecutionMetrics' as any, {
                toolId,
                executionTime: endTime - startTime,
                success: false,
                error: (error as Error).message,
                timestamp: endTime,
              });
              throw error;
            }
          };
        }
        return Reflect.get(target, prop, receiver);
      }
    });

    return wrappedEngine as any;
  }

  /**
   * Create debug middleware wrapper for model adapter
   */
  static createModelAdapterWrapper(adapter: ModelAdapter, eventBus: EventBus): ModelAdapter {
    const originalGenerate = adapter.generate.bind(adapter);

    const wrappedAdapter = new Proxy(adapter, {
      get(target, prop, receiver) {
        if (prop === 'generate') {
          return async function (input: any) {
            const startTime = Date.now();
            try {
              const result = await originalGenerate(input);
              const endTime = Date.now();

              eventBus.emit('ModelExecutionMetrics' as any, {
                modelId: adapter.id,
                executionTime: endTime - startTime,
                success: result.ok,
                timestamp: endTime,
              });

              return result;
            } catch (error) {
              const endTime = Date.now();
              eventBus.emit('ModelExecutionMetrics' as any, {
                modelId: adapter.id,
                executionTime: endTime - startTime,
                success: false,
                error: (error as Error).message,
                timestamp: endTime,
              });
              throw error;
            }
          };
        }
        return Reflect.get(target, prop, receiver);
      }
    });

    return wrappedAdapter as ModelAdapter;
  }
}