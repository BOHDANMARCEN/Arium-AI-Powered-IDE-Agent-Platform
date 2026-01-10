/**
 * Stress Test Framework for Tool Engine
 *
 * Framework for load testing and performance monitoring of the tool engine.
 * Supports concurrent execution, resource monitoring, and performance analysis.
 */

import { ToolEngine } from "../core/tool-engine";
import { EventBus } from "../core/eventBus";
import { VFS } from "../core/vfs";
import { registerBuiltinTools } from "../core/tools/builtinTools";
import { FULL_PERMISSIONS } from "../core/agent/permissions";
import * as os from "os";
import * as process from "process";

export interface StressTestConfig {
  /** Number of concurrent operations */
  concurrency: number;
  /** Total number of operations to perform */
  totalOperations: number;
  /** Timeout for individual operations (ms) */
  operationTimeout: number;
  /** Time window for rate limiting (ms) */
  rateLimitWindow: number;
  /** Maximum operations per time window */
  maxOperationsPerWindow: number;
  /** Whether to monitor system resources */
  monitorResources: boolean;
  /** Resource monitoring interval (ms) */
  monitoringInterval: number;
}

export interface StressTestResult {
  /** Total operations executed */
  totalExecuted: number;
  /** Operations that succeeded */
  successful: number;
  /** Operations that failed */
  failed: number;
  /** Operations that timed out */
  timedOut: number;
  /** Average execution time (ms) */
  averageExecutionTime: number;
  /** 95th percentile execution time (ms) */
  p95ExecutionTime: number;
  /** Operations per second */
  operationsPerSecond: number;
  /** Total duration (ms) */
  totalDuration: number;
  /** Peak memory usage (MB) */
  peakMemoryUsage: number;
  /** CPU usage statistics */
  cpuUsage: {
    average: number;
    peak: number;
  };
  /** Error breakdown */
  errors: Record<string, number>;
  /** Resource monitoring data */
  resourceHistory: ResourceSnapshot[];
}

export interface ResourceSnapshot {
  timestamp: number;
  memoryUsage: number; // MB
  cpuUsage: number; // percentage
  activeHandles: number;
}

export interface StressTestScenario {
  name: string;
  description: string;
  /** Function that performs a single operation */
  operation: (iteration: number) => Promise<any>;
  /** Setup function called before the test */
  setup?: () => Promise<void>;
  /** Cleanup function called after the test */
  cleanup?: () => Promise<void>;
}

/**
 * Stress Test Runner
 */
export class StressTestRunner {
  private config: StressTestConfig;
  private toolEngine: ToolEngine;
  private eventBus: EventBus;
  private vfs: VFS;
  private monitoringActive = false;
  private resourceHistory: ResourceSnapshot[] = [];
  private caller = { id: "stress-test", permissions: FULL_PERMISSIONS };

  constructor(config: Partial<StressTestConfig> = {}) {
    this.config = {
      concurrency: 10,
      totalOperations: 1000,
      operationTimeout: 30000,
      rateLimitWindow: 1000,
      maxOperationsPerWindow: 100,
      monitorResources: true,
      monitoringInterval: 1000,
      ...config,
    };

    // Initialize components
    this.eventBus = new EventBus();
    this.toolEngine = new ToolEngine(this.eventBus);
    this.vfs = new VFS(this.eventBus);

    // Register built-in tools
    registerBuiltinTools(this.toolEngine, this.vfs);

    // Register test utilities
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
      async (args: any) => ({ ok: true, data: `Echo: ${args.message}` })
    );

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
      async (args: any) => {
        const result =
          args.operation === "add" ? args.a + args.b : args.a * args.b;
        return { ok: true, data: { result } };
      }
    );
  }

  /**
   * Run a stress test scenario
   */
  async runScenario(scenario: StressTestScenario): Promise<StressTestResult> {
    console.log(`🔥 Starting stress test: ${scenario.name}`);
    console.log(`   Description: ${scenario.description}`);
    console.log(`   Concurrency: ${this.config.concurrency}`);
    console.log(`   Total Operations: ${this.config.totalOperations}`);

    // Setup
    if (scenario.setup) {
      console.log("   Setting up scenario...");
      await scenario.setup();
    }

    // Start resource monitoring
    if (this.config.monitorResources) {
      this.startResourceMonitoring();
    }

    const startTime = Date.now();
    const results: Array<{
      success: boolean;
      error?: string;
      executionTime: number;
      timedOut: boolean;
    }> = [];

    // Rate limiting state
    let windowStart = Date.now();
    let operationsInWindow = 0;

    // Run operations with controlled concurrency
    const semaphore = new Semaphore(this.config.concurrency);

    const operationPromises = Array.from(
      { length: this.config.totalOperations },
      async (_, i) => {
        await semaphore.acquire();

        const operationStart = Date.now();

        try {
          // Rate limiting
          const now = Date.now();
          if (now - windowStart >= this.config.rateLimitWindow) {
            windowStart = now;
            operationsInWindow = 0;
          }

          if (operationsInWindow >= this.config.maxOperationsPerWindow) {
            // Wait for next window
            const waitTime = this.config.rateLimitWindow - (now - windowStart);
            await new Promise(resolve => setTimeout(resolve, waitTime));
            windowStart = Date.now();
            operationsInWindow = 0;
          }

          operationsInWindow++;

          // Execute operation with timeout
          const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error("Operation timeout")), this.config.operationTimeout);
          });

          const result = await Promise.race([
            scenario.operation(i),
            timeoutPromise,
          ]);

          const executionTime = Math.max(1, Date.now() - operationStart);

          results.push({
            success: true,
            executionTime,
            timedOut: false,
          });

        } catch (error: any) {
          const executionTime = Math.max(1, Date.now() - operationStart);

          results.push({
            success: false,
            error: error.message,
            executionTime,
            timedOut: error.message === "Operation timeout",
          });
        } finally {
          semaphore.release();
        }
      }
    );

    // Wait for all operations to complete
    await Promise.all(operationPromises);

    // Stop monitoring
    if (this.config.monitorResources) {
      this.stopResourceMonitoring();
    }

    // Cleanup
    if (scenario.cleanup) {
      console.log("   Cleaning up scenario...");
      await scenario.cleanup();
    }

    const totalDuration = Date.now() - startTime;

    // Analyze results
    return this.analyzeResults(results, totalDuration);
  }

  /**
   * Run multiple scenarios in sequence
   */
  async runScenarios(scenarios: StressTestScenario[]): Promise<Record<string, StressTestResult>> {
    const results: Record<string, StressTestResult> = {};

    for (const scenario of scenarios) {
      results[scenario.name] = await this.runScenario(scenario);

      // Brief pause between scenarios
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    return results;
  }

  /**
   * Create a tool execution stress scenario
   */
  createToolScenario(toolId: string, argsFactory: (iteration: number) => any): StressTestScenario {
    return {
      name: `tool-${toolId}`,
      description: `Stress test for tool: ${toolId}`,
      operation: async (iteration) => {
        const args = argsFactory(iteration);
        const result = await this.toolEngine.invoke(toolId, args, this.caller);
        if (!result.ok) {
          throw new Error(result.error?.message || "Tool execution failed");
        }
        return result;
      },
    };
  }

  /**
   * Create a file system stress scenario
   */
  createFileSystemScenario(): StressTestScenario {
    return {
      name: "filesystem-io",
      description: "Stress test for file system operations",
      setup: async () => {
        // Create test directory
        await this.vfs.write("stress-test-dir/.gitkeep", "");
      },
      operation: async (iteration) => {
        const fileName = `stress-test-dir/file-${iteration}.txt`;
        const content = `Content for file ${iteration} - ${Date.now()}`;

        // Write file
        const writeResult = await this.toolEngine.invoke(
          "fs.write",
          {
            path: fileName,
            content,
          },
          this.caller
        );
        if (!writeResult.ok) {
          throw new Error(`Write failed: ${writeResult.error?.message}`);
        }

        // Read file
        const readResult = await this.toolEngine.invoke(
          "fs.read",
          {
            path: fileName,
          },
          this.caller
        );
        if (!readResult.ok) {
          throw new Error(`Read failed: ${readResult.error?.message}`);
        }

        if (readResult.data !== content) {
          throw new Error("Content mismatch");
        }

        // Delete file
        const deleteResult = await this.toolEngine.invoke(
          "fs.delete",
          {
            path: fileName,
          },
          this.caller
        );
        if (!deleteResult.ok) {
          throw new Error(`Delete failed: ${deleteResult.error?.message}`);
        }
      },
    };
  }

  /**
   * Create a mixed workload scenario
   */
  createMixedWorkloadScenario(): StressTestScenario {
    const operations = [
      // Echo operation
      async (i: number) => {
        const result = await this.toolEngine.invoke(
          "test.echo",
          {
            message: `Hello ${i}`,
          },
          this.caller
        );
        if (!result.ok) throw new Error("Echo failed");
        return result;
      },
      // Math operation
      async (i: number) => {
        const result = await this.toolEngine.invoke(
          "test.math",
          {
            operation: "add",
            a: i,
            b: i + 1,
          },
          this.caller
        );
        if (!result.ok) throw new Error("Math failed");
        return result;
      },
      // System info
      async () => {
        const result = await this.toolEngine.invoke("system.info", {}, this.caller);
        if (!result.ok) throw new Error("System info failed");
        return result;
      },
    ];

    return {
      name: "mixed-workload",
      description: "Mixed workload with different tool types",
      operation: async (iteration) => {
        const operationIndex = iteration % operations.length;
        return await operations[operationIndex](iteration);
      },
    };
  }

  /**
   * Start resource monitoring
   */
  private startResourceMonitoring(): void {
    this.monitoringActive = true;

    const monitor = () => {
      if (!this.monitoringActive) return;

      const snapshot: ResourceSnapshot = {
        timestamp: Date.now(),
        memoryUsage: Math.round((process.memoryUsage().heapUsed / 1024 / 1024) * 100) / 100,
        cpuUsage: 0, // CPU monitoring would require additional setup
        activeHandles: 0, // Handle count monitoring
      };

      this.resourceHistory.push(snapshot);

      setTimeout(monitor, this.config.monitoringInterval);
    };

    monitor();
  }

  /**
   * Stop resource monitoring
   */
  private stopResourceMonitoring(): void {
    this.monitoringActive = false;
  }

  /**
   * Analyze test results
   */
  private analyzeResults(
    results: Array<{
      success: boolean;
      error?: string;
      executionTime: number;
      timedOut: boolean;
    }>,
    totalDuration: number
  ): StressTestResult {
    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success && !r.timedOut).length;
    const timedOut = results.filter(r => r.timedOut).length;
    const totalExecuted = results.length;

    const executionTimes = results.map(r => r.executionTime).sort((a, b) => a - b);
    const averageExecutionTime = executionTimes.reduce((sum, time) => sum + time, 0) / executionTimes.length;
    const p95ExecutionTime = executionTimes[Math.floor(executionTimes.length * 0.95)] || 0;
    const operationsPerSecond = (totalExecuted / totalDuration) * 1000;

    // Peak memory usage
    const peakMemoryUsage =
      this.resourceHistory.length > 0
        ? Math.max(...this.resourceHistory.map(r => r.memoryUsage))
        : 0;

    // CPU usage (simplified)
    const cpuUsage = {
      average: 0, // Would need proper CPU monitoring
      peak: 0,
    };

    // Error breakdown
    const errors: Record<string, number> = {};
    results
      .filter(r => !r.success)
      .forEach(r => {
        const errorType = r.timedOut ? "timeout" : (r.error || "unknown");
        errors[errorType] = (errors[errorType] || 0) + 1;
      });

    console.log(`\n📊 Stress Test Results:`);
    console.log(`   Executed: ${totalExecuted}`);
    console.log(`   Successful: ${successful} (${((successful / totalExecuted) * 100).toFixed(1)}%)`);
    console.log(`   Failed: ${failed}`);
    console.log(`   Timed Out: ${timedOut}`);
    console.log(`   Average Execution Time: ${averageExecutionTime.toFixed(2)}ms`);
    console.log(`   95th Percentile: ${p95ExecutionTime.toFixed(2)}ms`);
    console.log(`   Operations/Second: ${operationsPerSecond.toFixed(2)}`);
    console.log(`   Peak Memory: ${peakMemoryUsage}MB`);

    return {
      totalExecuted,
      successful,
      failed,
      timedOut,
      averageExecutionTime,
      p95ExecutionTime,
      operationsPerSecond,
      totalDuration,
      peakMemoryUsage,
      cpuUsage,
      errors,
      resourceHistory: this.resourceHistory,
    };
  }
}

/**
 * Semaphore for controlling concurrency
 */
class Semaphore {
  private permits: number;
  private waiting: Array<() => void> = [];

  constructor(permits: number) {
    this.permits = permits;
  }

  async acquire(): Promise<void> {
    if (this.permits > 0) {
      this.permits--;
      return;
    }

    return new Promise(resolve => {
      this.waiting.push(resolve);
    });
  }

  release(): void {
    this.permits++;
    if (this.waiting.length > 0) {
      const resolve = this.waiting.shift()!;
      this.permits--;
      resolve();
    }
  }
}

/**
 * Predefined stress test scenarios
 */
export const STANDARD_STRESS_SCENARIOS: StressTestScenario[] = [
  {
    name: "echo-flood",
    description: "High-frequency echo tool calls",
    operation: async (iteration) => {
      // This would be implemented in the runner
      throw new Error("Use createToolScenario for tool-specific tests");
    },
  },
  {
    name: "math-compute",
    description: "Mathematical computations",
    operation: async (iteration) => {
      throw new Error("Use createToolScenario for tool-specific tests");
    },
  },
];

/**
 * Create a stress test runner with default configuration
 */
export function createStressTestRunner(config?: Partial<StressTestConfig>): StressTestRunner {
  return new StressTestRunner(config);
}

/**
 * Run a quick performance benchmark
 */
export async function quickBenchmark(scenario: StressTestScenario): Promise<StressTestResult> {
  const runner = createStressTestRunner({
    concurrency: 5,
    totalOperations: 100,
    operationTimeout: 10000,
    monitorResources: false,
  });

  return runner.runScenario(scenario);
}
