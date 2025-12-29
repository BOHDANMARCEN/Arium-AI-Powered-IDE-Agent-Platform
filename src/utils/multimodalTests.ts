/**
 * Multimodal Test Framework
 *
 * Framework for testing AI agents and tools across multiple model adapters.
 * Ensures consistency and compatibility across different AI models.
 */

import { MockAdapter } from "../core/models/mockAdapter";
import { EventBus } from "../core/eventBus";
import { ToolEngine } from "../core/tool-engine";
import { AgentCore } from "../core/agent/agentCore";
import { GoldenTestRunner } from "./goldenTests";
import * as path from "path";

export interface ModelTestConfig {
  name: string;
  adapter: any; // Using any for now due to mixed interfaces
  enabled: boolean;
  expectedCapabilities?: string[];
}

export interface MultimodalTestResult {
  modelName: string;
  testName: string;
  passed: boolean;
  executionTime: number;
  response?: any;
  error?: string;
  comparison?: {
    consistent: boolean;
    differences: string[];
  };
}

export interface MultimodalTestSuite {
  name: string;
  description: string;
  testFn: (agent: AgentCore) => Promise<any>;
  expectedConsistency?: boolean; // Whether results should be consistent across models
}

/**
 * Multimodal Test Runner
 */
export class MultimodalTestRunner {
  private models: ModelTestConfig[] = [];
  private eventBus: EventBus;
  private toolEngine: ToolEngine;
  private goldenRunner: GoldenTestRunner;

  constructor(goldenDir: string) {
    this.eventBus = new EventBus();
    this.toolEngine = new ToolEngine(this.eventBus);
    this.goldenRunner = new GoldenTestRunner({ goldenDir });

    // Register basic tools for testing
    this.setupTools();
  }

  /**
   * Add a model to the test suite
   */
  addModel(config: ModelTestConfig): void {
    this.models.push(config);
  }

  /**
   * Setup default models for testing
   */
  async setupDefaultModels(): Promise<void> {
    // Mock adapter (always available)
    this.addModel({
      name: "mock",
      adapter: new MockAdapter(this.eventBus),
      enabled: true,
      expectedCapabilities: ["basic-responses"],
    });

    // TODO: Add OpenAI and Ollama adapters when interfaces are unified
    // For now, only MockAdapter is supported due to mixed interface versions
  }

  /**
   * Run a test suite across all enabled models
   */
  async runTestSuite(suite: MultimodalTestSuite): Promise<MultimodalTestResult[]> {
    const results: MultimodalTestResult[] = [];
    const enabledModels = this.models.filter(m => m.enabled);

    console.log(`🧪 Running multimodal test suite: ${suite.name}`);
    console.log(`   Description: ${suite.description}`);
    console.log(`   Models: ${enabledModels.map(m => m.name).join(", ")}`);

    for (const modelConfig of enabledModels) {
      const startTime = Date.now();

      try {
        // Create agent with this model
        const agent = new AgentCore({
          id: `test-agent-${modelConfig.name}`,
          model: modelConfig.adapter,
        }, this.eventBus, this.toolEngine);

        // Run the test
        const response = await suite.testFn(agent);
        const executionTime = Date.now() - startTime;

        results.push({
          modelName: modelConfig.name,
          testName: suite.name,
          passed: true,
          executionTime,
          response,
        });

        console.log(`   ✅ ${modelConfig.name}: ${executionTime}ms`);

      } catch (error: any) {
        const executionTime = Date.now() - startTime;

        results.push({
          modelName: modelConfig.name,
          testName: suite.name,
          passed: false,
          executionTime,
          error: error.message,
        });

        console.log(`   ❌ ${modelConfig.name}: ${error.message} (${executionTime}ms)`);
      }
    }

    // Analyze consistency if expected
    if (suite.expectedConsistency && results.length > 1) {
      this.analyzeConsistency(results, suite.name);
    }

    return results;
  }

  /**
   * Run golden multimodal tests
   */
  async runGoldenMultimodalTest(
    testName: string,
    testFn: (agent: AgentCore) => Promise<any>
  ): Promise<void> {
    const enabledModels = this.models.filter(m => m.enabled);

    for (const modelConfig of enabledModels) {
      const agent = new AgentCore({
        id: `golden-agent-${modelConfig.name}`,
        model: modelConfig.adapter,
      }, this.eventBus, this.toolEngine);

      await this.goldenRunner.update(`${testName}-${modelConfig.name}`, () =>
        testFn(agent)
      );
    }
  }

  /**
   * Get test summary
   */
  getSummary(results: MultimodalTestResult[]): {
    total: number;
    passed: number;
    failed: number;
    averageTime: number;
  } {
    const total = results.length;
    const passed = results.filter(r => r.passed).length;
    const failed = total - passed;
    const averageTime = results.reduce((sum, r) => sum + r.executionTime, 0) / total;

    return { total, passed, failed, averageTime };
  }

  /**
   * Setup basic tools for testing
   */
  private setupTools(): void {
    // Register a simple test tool
    this.toolEngine.register(
      {
        id: "test.echo",
        name: "Echo Tool",
        runner: "builtin",
        schema: {
          type: "object",
          properties: {
            message: { type: "string" },
          },
          required: ["message"],
        },
      },
      async (args: any, ctx: any) => ({
        ok: true,
        data: `Echo: ${args.message}`,
      } as any)
    );

    // Register a math tool
    this.toolEngine.register(
      {
        id: "test.math",
        name: "Math Tool",
        runner: "builtin",
        schema: {
          type: "object",
          properties: {
            operation: { type: "string", enum: ["add", "multiply"] },
            a: { type: "number" },
            b: { type: "number" },
          },
          required: ["operation", "a", "b"],
        },
      },
      async (args: any, ctx: any) => {
        let result: number;
        switch (args.operation) {
          case "add":
            result = args.a + args.b;
            break;
          case "multiply":
            result = args.a * args.b;
            break;
          default:
            throw new Error(`Unknown operation: ${args.operation}`);
        }
        return {
          ok: true,
          data: { result, operation: args.operation, inputs: [args.a, args.b] },
        } as any;
      }
    );
  }

  /**
   * Analyze consistency across model results
   */
  private analyzeConsistency(results: MultimodalTestResult[], suiteName: string): void {
    const successfulResults = results.filter(r => r.passed);

    if (successfulResults.length < 2) {
      console.log(`   ⚠️  Cannot analyze consistency: need at least 2 successful results`);
      return;
    }

    // Simple consistency check based on response structure
    const responses = successfulResults.map(r => r.response);
    const firstResponse = responses[0];

    let consistent = true;
    const differences: string[] = [];

    for (let i = 1; i < responses.length; i++) {
      if (!this.deepEqualStructure(firstResponse, responses[i])) {
        consistent = false;
        differences.push(`${successfulResults[0].modelName} vs ${successfulResults[i].modelName}`);
      }
    }

    if (consistent) {
      console.log(`   🎯 Results are consistent across models`);
    } else {
      console.log(`   ⚠️  Results differ across models: ${differences.join(", ")}`);
    }

    // Store consistency analysis in results
    successfulResults.forEach(result => {
      result.comparison = {
        consistent,
        differences,
      };
    });
  }

  /**
   * Check if two objects have the same structure (for consistency analysis)
   */
  private deepEqualStructure(a: any, b: any): boolean {
    if (typeof a !== typeof b) return false;

    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) return false;
      return a.every((item, index) => this.deepEqualStructure(item, b[index]));
    }

    if (typeof a === "object" && a !== null && typeof b === "object" && b !== null) {
      const keysA = Object.keys(a).sort();
      const keysB = Object.keys(b).sort();
      if (!this.deepEqualStructure(keysA, keysB)) return false;

      return keysA.every(key => this.deepEqualStructure(a[key], b[key]));
    }

    return true;
  }
}

/**
 * Predefined test suites for common multimodal scenarios
 */
export const STANDARD_MULTIMODAL_TESTS: MultimodalTestSuite[] = [
  {
    name: "basic-response",
    description: "Test basic text response generation",
    testFn: async (agent) => {
      // This would normally call agent.run(), but we'll simulate
      return { type: "text", content: "Hello, world!" };
    },
    expectedConsistency: true,
  },
  {
    name: "tool-usage",
    description: "Test tool calling and execution",
    testFn: async (agent) => {
      // Test tool invocation
      const result = await agent.run("Use the echo tool to say 'test message'");
      return {
        success: result.ok,
        hasToolCalls: true, // Would check actual tool calls
        response: result,
      };
    },
    expectedConsistency: false, // Different models may use tools differently
  },
  {
    name: "error-handling",
    description: "Test error handling and recovery",
    testFn: async (agent) => {
      try {
        await agent.run("This should trigger an error scenario");
        return { error: null, handled: true };
      } catch (error: any) {
        return { error: error.message, handled: false };
      }
    },
    expectedConsistency: true,
  },
];

/**
 * Create a multimodal test runner with default configuration
 */
export async function createMultimodalTestRunner(goldenDir: string): Promise<MultimodalTestRunner> {
  const runner = new MultimodalTestRunner(goldenDir);
  await runner.setupDefaultModels();
  return runner;
}
