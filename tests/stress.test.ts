/**
 * Stress Test Framework Examples
 */

import { createStressTestRunner, quickBenchmark } from "../src/utils/stressTests";

describe("Stress Test Framework", () => {
  let runner: ReturnType<typeof createStressTestRunner>;

  beforeEach(() => {
    runner = createStressTestRunner({
      concurrency: 2, // Low concurrency for testing
      totalOperations: 10, // Few operations for testing
      monitorResources: false, // Disable resource monitoring in tests
    });
  });

  describe("StressTestRunner", () => {
    test("should initialize with default config", () => {
      expect(runner).toBeDefined();
    });

    test("should run file system stress scenario", async () => {
      const scenario = runner.createFileSystemScenario();

      const result = await runner.runScenario(scenario);

      expect(result).toBeDefined();
      expect(result.totalExecuted).toBeGreaterThan(0);
      expect(result.successful).toBeGreaterThanOrEqual(0);
      expect(result.failed).toBeGreaterThanOrEqual(0);
      expect(result.totalDuration).toBeGreaterThan(0);
    }, 30000);

    test("should run tool-specific stress scenario", async () => {
      const scenario = runner.createToolScenario("test.echo", (i) => ({
        message: `Test message ${i}`,
      }));

      const result = await runner.runScenario(scenario);

      expect(result).toBeDefined();
      expect(result.totalExecuted).toBe(10); // Our test config
      expect(result.successful).toBe(10); // All should succeed
      expect(result.failed).toBe(0);
    });

    test("should run mixed workload scenario", async () => {
      const scenario = runner.createMixedWorkloadScenario();

      const result = await runner.runScenario(scenario);

      expect(result).toBeDefined();
      expect(result.totalExecuted).toBe(10);
      expect(result.successful).toBeGreaterThan(0);
    });

    test("should handle operation timeouts", async () => {
      const slowRunner = createStressTestRunner({
        concurrency: 1,
        totalOperations: 2,
        operationTimeout: 100, // Very short timeout
        monitorResources: false,
      });

      const scenario = {
        name: "timeout-test",
        description: "Test timeout handling",
        operation: async () => {
          await new Promise(resolve => setTimeout(resolve, 200)); // Longer than timeout
          return { success: true };
        },
      };

      const result = await slowRunner.runScenario(scenario);

      expect(result.timedOut).toBeGreaterThan(0);
    });

    test("should provide performance metrics", async () => {
      const scenario = runner.createToolScenario("system.info", () => ({}));

      const result = await runner.runScenario(scenario);

      expect(result.averageExecutionTime).toBeGreaterThan(0);
      expect(result.operationsPerSecond).toBeGreaterThan(0);
      expect(result.p95ExecutionTime).toBeGreaterThanOrEqual(result.averageExecutionTime);
    });
  });

  describe("Quick Benchmark", () => {
    test("should run quick benchmark", async () => {
      const scenario = {
        name: "quick-bench",
        description: "Quick benchmark test",
        operation: async (i) => {
          // Simple operation
          return i * 2;
        },
      };

      const result = await quickBenchmark(scenario);

      expect(result).toBeDefined();
      expect(result.totalExecuted).toBe(100); // Default for quickBenchmark
      expect(result.successful).toBe(100);
      expect(result.failed).toBe(0);
      expect(result.averageExecutionTime).toBeGreaterThan(0);
    });
  });

  describe("Resource Monitoring", () => {
    test("should collect resource snapshots when enabled", async () => {
      const monitoringRunner = createStressTestRunner({
        concurrency: 1,
        totalOperations: 3,
        monitorResources: true,
        monitoringInterval: 50, // Fast monitoring for test
      });

      const scenario = {
        name: "resource-test",
        description: "Test resource monitoring",
        operation: async () => {
          await new Promise(resolve => setTimeout(resolve, 10));
          return { success: true };
        },
      };

      const result = await monitoringRunner.runScenario(scenario);

      expect(result.resourceHistory.length).toBeGreaterThan(0);
      expect(result.peakMemoryUsage).toBeGreaterThan(0);

      // Check resource snapshot structure
      const snapshot = result.resourceHistory[0];
      expect(snapshot).toHaveProperty("timestamp");
      expect(snapshot).toHaveProperty("memoryUsage");
      expect(snapshot).toHaveProperty("cpuUsage");
      expect(snapshot).toHaveProperty("activeHandles");
    });
  });

  describe("Error Handling", () => {
    test("should handle operation failures gracefully", async () => {
      const scenario = {
        name: "error-test",
        description: "Test error handling",
        operation: async (i: number) => {
          if (i % 2 === 0) {
            throw new Error("Simulated error");
          }
          return { success: true };
        },
      };

      const result = await runner.runScenario(scenario);

      expect(result.failed).toBeGreaterThan(0);
      expect(result.successful).toBeGreaterThan(0);
      expect(result.errors).toHaveProperty("Simulated error");
    });

    test("should handle setup/cleanup failures", async () => {
      const scenario = {
        name: "setup-cleanup-test",
        description: "Test setup/cleanup error handling",
        setup: async () => {
          throw new Error("Setup failed");
        },
        operation: async () => ({ success: true }),
        cleanup: async () => {
          throw new Error("Cleanup failed");
        },
      };

      await expect(runner.runScenario(scenario)).rejects.toThrow("Setup failed");
    });
  });

  describe("Concurrency Control", () => {
    test("should respect concurrency limits", async () => {
      let concurrentOperations = 0;
      let maxConcurrent = 0;

      const scenario = {
        name: "concurrency-test",
        description: "Test concurrency control",
        operation: async () => {
          concurrentOperations++;
          maxConcurrent = Math.max(maxConcurrent, concurrentOperations);

          // Simulate some work
          await new Promise(resolve => setTimeout(resolve, 10));

          concurrentOperations--;
          return { success: true };
        },
      };

      await runner.runScenario(scenario);

      // Should not exceed configured concurrency (2)
      expect(maxConcurrent).toBeLessThanOrEqual(2);
    });
  });

  describe("Rate Limiting", () => {
    test("should handle rate limiting", async () => {
      const rateLimitedRunner = createStressTestRunner({
        concurrency: 5,
        totalOperations: 20,
        rateLimitWindow: 100,
        maxOperationsPerWindow: 5,
        monitorResources: false,
      });

      const startTime = Date.now();

      const scenario = {
        name: "rate-limit-test",
        description: "Test rate limiting",
        operation: async () => ({ success: true }),
      };

      const result = await rateLimitedRunner.runScenario(scenario);

      const duration = Date.now() - startTime;

      // Should take longer due to rate limiting
      expect(duration).toBeGreaterThan(200); // At least 2 windows of 100ms each
      expect(result.successful).toBe(20);
    });
  });
});
