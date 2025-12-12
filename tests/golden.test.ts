/**
 * Golden Test Framework Examples
 */

import { runGoldenTest, GoldenTestRunner, setupGoldenTestDirs } from "../src/utils/goldenTests";
import * as path from "path";

describe("Golden Test Framework", () => {
  const goldenDir = path.join(__dirname, "golden");

  beforeAll(async () => {
    await setupGoldenTestDirs(__dirname);
  });

  describe("runGoldenTest function", () => {
    test("should pass when data matches golden file", async () => {
      const testData = { message: "hello world", count: 42 };

      // First, create/update the golden file
      const result = await runGoldenTest("simple-test", testData, {
        goldenDir,
        updateGolden: true,
      });

      expect(result.passed).toBe(true);

      // Now test that it matches
      const compareResult = await runGoldenTest("simple-test", testData, {
        goldenDir,
        updateGolden: false,
      });

      expect(compareResult.passed).toBe(true);
    });

    test("should fail when data does not match", async () => {
      const originalData = { value: 1 };
      const differentData = { value: 2 };

      // Create golden file with original data
      await runGoldenTest("mismatch-test", originalData, {
        goldenDir,
        updateGolden: true,
      });

      // Compare with different data
      const result = await runGoldenTest("mismatch-test", differentData, {
        goldenDir,
        updateGolden: false,
      });

      expect(result.passed).toBe(false);
      expect(result.diff).toBeDefined();
    });

    test("should handle complex objects", async () => {
      const complexData = {
        agent: {
          id: "test-agent",
          model: "gpt-4",
          tools: ["fs.read", "fs.write"],
        },
        response: {
          steps: [
            { type: "tool_call", tool: "fs.read", args: { path: "test.txt" } },
            { type: "response", content: "File content here" },
          ],
        },
      };

      const result = await runGoldenTest("complex-test", complexData, {
        goldenDir,
        updateGolden: true,
      });

      expect(result.passed).toBe(true);
    });
  });

  describe("GoldenTestRunner class", () => {
    const runner = new GoldenTestRunner({
      goldenDir: path.join(goldenDir, "runner-tests"),
    });

    test("should run tests successfully", async () => {
      await runner.update("runner-test-1", async () => {
        return { result: "success", timestamp: Date.now() };
      });

      // This should pass since we just updated it
      await runner.test("runner-test-1", async () => {
        return { result: "success", timestamp: expect.any(Number) };
      });
    });

    test("should handle async test functions", async () => {
      await runner.update("async-test", async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        return { async: true, data: [1, 2, 3] };
      });

      await runner.test("async-test", async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        return { async: true, data: [1, 2, 3] };
      });
    });
  });

  describe("Agent Response Golden Tests", () => {
    const agentGoldenDir = path.join(goldenDir, "agent-responses");

    test("should capture agent reasoning patterns", async () => {
      const agentResponse = {
        input: "Create a simple calculator function",
        steps: [
          {
            type: "reasoning",
            content: "I need to create a calculator function with basic operations",
          },
          {
            type: "tool_call",
            tool: "fs.write",
            args: {
              path: "calculator.js",
              content: `function calculator(a, b, op) {
  switch(op) {
    case '+': return a + b;
    case '-': return a - b;
    case '*': return a * b;
    case '/': return a / b;
    default: throw new Error('Unknown operation');
  }
}`,
            },
          },
          {
            type: "response",
            content: "Calculator function created successfully",
          },
        ],
        finalResult: "Function written to calculator.js",
      };

      const result = await runGoldenTest("calculator-agent", agentResponse, {
        goldenDir: agentGoldenDir,
        updateGolden: true, // Set to true when creating new golden files
      });

      expect(result.passed).toBe(true);
    });

    test("should capture tool execution results", async () => {
      const toolExecution = {
        toolId: "fs.read",
        args: { path: "example.txt" },
        result: {
          ok: true,
          data: "This is the content of example.txt\nWith multiple lines",
        },
        executionTime: 45, // ms
        permissions: ["vfs.read"],
      };

      const result = await runGoldenTest("tool-execution", toolExecution, {
        goldenDir: path.join(goldenDir, "tool-outputs"),
        updateGolden: true,
      });

      expect(result.passed).toBe(true);
    });
  });
});
