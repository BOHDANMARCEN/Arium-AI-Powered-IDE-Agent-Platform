/**
 * Multimodal Test Framework Examples
 */

import { createMultimodalTestRunner, STANDARD_MULTIMODAL_TESTS } from "../src/utils/multimodalTests";
import * as path from "path";

describe("Multimodal Test Framework", () => {
  const goldenDir = path.join(__dirname, "golden", "multimodal");

  let runner: Awaited<ReturnType<typeof createMultimodalTestRunner>>;

  beforeAll(async () => {
    runner = await createMultimodalTestRunner(goldenDir);
  });

  describe("MultimodalTestRunner", () => {
    test("should initialize with default models", () => {
      // Mock adapter should be available
      expect(runner).toBeDefined();
    });

    test("should run standard test suites", async () => {
      for (const suite of STANDARD_MULTIMODAL_TESTS) {
        const results = await runner.runTestSuite(suite);

        // Should have at least one result (mock adapter)
        expect(results.length).toBeGreaterThan(0);

        // Each result should have required fields
        for (const result of results) {
          expect(result).toHaveProperty("modelName");
          expect(result).toHaveProperty("testName");
          expect(result).toHaveProperty("passed");
          expect(result).toHaveProperty("executionTime");
        }
      }
    });

    test("should provide test summaries", async () => {
      const results = await runner.runTestSuite(STANDARD_MULTIMODAL_TESTS[0]);
      const summary = runner.getSummary(results);

      expect(summary).toHaveProperty("total");
      expect(summary).toHaveProperty("passed");
      expect(summary).toHaveProperty("failed");
      expect(summary).toHaveProperty("averageTime");

      expect(summary.total).toBe(results.length);
      expect(summary.passed + summary.failed).toBe(summary.total);
    });
  });

  describe("Golden Multimodal Tests", () => {
    test("should create golden files for multimodal scenarios", async () => {
      await runner.runGoldenMultimodalTest("basic-agent-response", async (agent) => {
        // Simulate a basic agent response for golden testing
        return {
          input: "Hello",
          output: "Hello! How can I help you today?",
          modelUsed: "mock",
          timestamp: Date.now(),
        };
      });

      // Test passes if no exception is thrown
      expect(true).toBe(true);
    });

    test("should handle complex multimodal scenarios", async () => {
      await runner.runGoldenMultimodalTest("complex-agent-interaction", async (agent) => {
        // Simulate a complex interaction with tool usage
        const result = await agent.run("Calculate 5 + 3 and echo the result");

        return {
          task: "Calculate 5 + 3 and echo the result",
          finalResult: result,
          steps: [
            {
              type: "tool_call",
              tool: "test.math",
              args: { operation: "add", a: 5, b: 3 },
            },
            {
              type: "tool_call",
              tool: "test.echo",
              args: { message: "8" },
            },
            {
              type: "response",
              content: "Echo: 8",
            },
          ],
          success: result.ok,
        };
      });

      expect(true).toBe(true);
    });
  });

  describe("Consistency Analysis", () => {
    test("should analyze consistency when multiple models are available", async () => {
      // Add a second mock adapter to test consistency
      runner.addModel({
        name: "mock2",
        adapter: {
          generate: async (prompt: string) => ({
            type: "final",
            content: "Consistent response",
          }),
        },
        enabled: true,
      });

      const consistentSuite = {
        name: "consistency-test",
        description: "Test consistency analysis",
        testFn: async () => ({ result: "same", value: 42 }),
        expectedConsistency: true,
      };

      const results = await runner.runTestSuite(consistentSuite);

      // Should have consistency analysis
      const successfulResults = results.filter(r => r.passed);
      if (successfulResults.length > 1) {
        successfulResults.forEach(result => {
          expect(result.comparison).toBeDefined();
          expect(result.comparison?.consistent).toBe(true);
        });
      }
    });
  });

  describe("Error Handling", () => {
    test("should handle model failures gracefully", async () => {
      // Add a failing model
      runner.addModel({
        name: "failing-model",
        adapter: {
          generate: async () => {
            throw new Error("Model failure");
          },
        },
        enabled: true,
      });

      const suite = {
        name: "error-test",
        description: "Test error handling",
        testFn: async (agent: any) => {
          return { success: true };
        },
      };

      const results = await runner.runTestSuite(suite);

      const failingResult = results.find(r => r.modelName === "failing-model");
      expect(failingResult).toBeDefined();
      expect(failingResult?.passed).toBe(false);
      expect(failingResult?.error).toContain("Model failure");
    });
  });
});
