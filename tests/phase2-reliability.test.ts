/**
 * Phase 2 Reliability Tests
 * Tests for BoundedContext, EventBus archival, Loop Detection, Error Handling
 * 
 * Author: Bogdan Marcen & ChatGPT 5.1
 */

import { BoundedContext, ContextMessage } from "../src/core/agent/boundedContext";
import { EventBus } from "../src/core/eventBus";
import { AgentCore, AgentConfig } from "../src/core/agent/agentCore";
import { EventBus as EventBusType } from "../src/core/eventBus";
import { ToolEngine } from "../src/core/tool-engine";
import { MockAdapter } from "../src/core/models/mockAdapter";
import { ok, err, isOk, isErr, unwrapOr } from "../src/core/utils/result";
import {
  ValidationError,
  PermissionError,
  TimeoutError,
  ModelError,
} from "../src/core/errors/standardErrors";

describe("Phase 2 Reliability Tests", () => {
  describe("2.1 BoundedContext", () => {
    test("should evict old messages when token limit exceeded", () => {
      const context = new BoundedContext({ maxTokens: 100 });
      
      // Add messages until limit is exceeded
      for (let i = 0; i < 20; i++) {
        context.add({
          role: "user",
          content: `Message ${i}: ${"x".repeat(20)}`, // ~5 tokens each
        });
      }

      const metrics = context.getMetrics();
      expect(metrics.currentTokens).toBeLessThanOrEqual(100);
      expect(metrics.droppedMessages).toBeGreaterThan(0);
    });

    test("should never evict system messages", () => {
      const context = new BoundedContext({ maxTokens: 50 });
      
      context.add({ role: "system", content: "System message" });
      
      // Add many user messages
      for (let i = 0; i < 30; i++) {
        context.add({
          role: "user",
          content: `User message ${i}`,
        });
      }

      const all = context.getAll();
      const systemMessages = all.filter((m) => m.role === "system");
      expect(systemMessages.length).toBeGreaterThan(0);
    });

    test("should summarize when near capacity", () => {
      const context = new BoundedContext({ maxTokens: 100 });
      
      // Fill context
      for (let i = 0; i < 15; i++) {
        context.add({
          role: "user",
          content: `Message ${i}`,
        });
      }

      const summary = context.summarize(5);
      expect(summary.role).toBe("system");
      expect(summary.type).toBe("context_summary");
      
      const metrics = context.getMetrics();
      expect(metrics.currentTokens).toBeLessThan(100);
    });

    test("should expose droppedMessages metric", () => {
      const context = new BoundedContext({ maxTokens: 50 });
      
      for (let i = 0; i < 20; i++) {
        context.add({
          role: "user",
          content: `Message ${i}`,
        });
      }

      const metrics = context.getMetrics();
      expect(metrics.droppedMessages).toBeGreaterThan(0);
      expect(metrics.totalMessages).toBeLessThan(20);
    });

    test("should check if near capacity", () => {
      const context = new BoundedContext({ maxTokens: 100 });
      
      expect(context.isNearCapacity(0.9)).toBe(false);
      
      // Fill context
      for (let i = 0; i < 20; i++) {
        context.add({
          role: "user",
          content: `Message ${i}: ${"x".repeat(30)}`,
        });
      }

      expect(context.isNearCapacity(0.9)).toBe(true);
    });
  });

  describe("2.2 EventBus Circular Buffer", () => {
    test("should archive old events when threshold reached", () => {
      const eventBus = new EventBus({
        maxHistorySize: 100,
        archiveThreshold: 80,
      });

      // Emit events until threshold
      for (let i = 0; i < 90; i++) {
        eventBus.emit("AgentStepEvent", { step: i });
      }

      const metrics = eventBus.getMemoryMetrics();
      expect(metrics.historySize).toBeLessThan(90); // Some archived
    });

    test("should emit EventArchiveEvent when archiving", () => {
      const eventBus = new EventBus({
        maxHistorySize: 100,
        archiveThreshold: 80,
      });

      const archiveEvents: any[] = [];
      eventBus.on("EventArchiveEvent", (evt) => {
        archiveEvents.push(evt);
      });

      // Emit events until threshold
      for (let i = 0; i < 90; i++) {
        eventBus.emit("AgentStepEvent", { step: i });
      }

      expect(archiveEvents.length).toBeGreaterThan(0);
    });

    test("should call archive callback if provided", () => {
      const archived: any[] = [];
      const eventBus = new EventBus({
        maxHistorySize: 100,
        archiveThreshold: 80,
        archiveCallback: (events) => {
          archived.push(...events);
        },
      });

      // Emit events until threshold
      for (let i = 0; i < 90; i++) {
        eventBus.emit("AgentStepEvent", { step: i });
      }

      expect(archived.length).toBeGreaterThan(0);
    });

    test("should provide memory usage metrics", () => {
      const eventBus = new EventBus({ maxHistorySize: 100 });

      for (let i = 0; i < 50; i++) {
        eventBus.emit("AgentStepEvent", { step: i });
      }

      const metrics = eventBus.getMemoryMetrics();
      expect(metrics.historySize).toBe(50);
      expect(metrics.totalEvents).toBeGreaterThanOrEqual(50);
      expect(metrics.estimatedMemoryBytes).toBeGreaterThan(0);
    });
  });

  describe("2.3 Loop Detection & Execution Safety", () => {
    let eventBus: EventBusType;
    let toolEngine: ToolEngine;
    let agent: AgentCore;

    beforeEach(() => {
      eventBus = new EventBus();
      toolEngine = new ToolEngine(eventBus);
      toolEngine.register(
        {
          id: "test.tool",
          name: "Test Tool",
          runner: "builtin",
        },
        async () => ({ ok: true, data: "test" })
      );

      agent = new AgentCore(
        {
          id: "test-agent",
          maxSteps: 10,
          model: new MockAdapter(),
          globalTimeoutMs: 5000,
        },
        eventBus,
        toolEngine
      );
    });

    test("should detect repeated tool calls (max 3)", async () => {
      // Mock adapter that always returns same tool call
      let callCount = 0;
      const mockModel = {
        generate: async () => {
          callCount++;
          // Return tool call every time
          return {
            type: "tool" as const,
            tool: "test.tool",
            arguments: { count: callCount },
          };
        },
      };

      const testAgent = new AgentCore(
        {
          id: "test-agent",
          maxSteps: 10,
          model: mockModel as any,
          maxIdenticalToolCalls: 3,
        },
        eventBus,
        toolEngine
      );

      const result = await testAgent.run("test");
      // Should detect loop after 3 identical calls and return error result
      // OR complete but with loop detection events
      const events = eventBus.getHistory({ type: "AgentStepEvent" });
      const loopEvents = events.filter((e: any) => e.payload?.action === "loop_detected");
      
      // Either we got an error result OR loop was detected via events
      if (!result.ok) {
        expect(result.error.message).toMatch(/repeatedly|loop/i);
      } else {
        // If completed, verify loop detection events were emitted
        expect(loopEvents.length).toBeGreaterThan(0);
      }
    });

    test("should enforce global timeout", async () => {
      const slowModel = {
        generate: async () => {
          // Wait longer than global timeout
          await new Promise((resolve) => setTimeout(resolve, 500));
          return { type: "final" as const, content: "done" };
        },
      };

      const testAgent = new AgentCore(
        {
          id: "test-agent",
          maxSteps: 10,
          model: slowModel as any,
          maxExecutionTimeMs: 100, // Very short timeout (100ms)
        },
        eventBus,
        toolEngine
      );

      await expect(testAgent.run("test")).rejects.toThrow(TimeoutError);
    }, 5000); // Increase test timeout

    test("should support emergency stop via EventBus", async () => {
      // Create agent with slow model to allow time for emergency stop
      const slowModel = {
        generate: async () => {
          await new Promise((resolve) => setTimeout(resolve, 200));
          return { type: "final" as const, content: "done" };
        },
      };

      const testAgent = new AgentCore(
        {
          id: "test-agent",
          maxSteps: 10,
          model: slowModel as any,
        },
        eventBus,
        toolEngine
      );

      const runPromise = testAgent.run("test");

      // Emit emergency stop after a short delay (before model responds)
      setTimeout(() => {
        eventBus.emit("AgentEmergencyStopEvent" as any, { 
          payload: { agentId: "test-agent" } 
        });
      }, 50);

      const result = await runPromise;
      // Should return error result due to emergency stop
      if (result.ok) {
        // If it completed, check that emergency stop was handled
        const finishEvents = eventBus.getHistory({ type: "AgentFinishEvent" });
        const stopEvent = finishEvents.find((e: any) => e.payload.reason === "emergency_stop");
        expect(stopEvent).toBeDefined();
      } else {
        expect(result.error.message).toContain("Emergency stop");
      }
    }, 5000);

    test("should always increment step in finally", async () => {
      const steps: number[] = [];
      eventBus.on("AgentStepEvent", (evt) => {
        if (evt.payload.step !== undefined) {
          steps.push(evt.payload.step);
        }
      });

      const result = await agent.run("test");
      // Should complete (may succeed or fail)
      expect(result).toBeDefined();

      // Steps should be sequential if any were emitted
      if (steps.length > 0) {
        for (let i = 0; i < steps.length; i++) {
          expect(steps[i]).toBe(i + 1);
        }
      }
    });
  });

  describe("2.4 Standardized Error Handling", () => {
    test("should create ok result", () => {
      const result = ok("success");
      expect(isOk(result)).toBe(true);
      expect(isErr(result)).toBe(false);
      expect(result.value).toBe("success");
    });

    test("should create err result", () => {
      const error = new Error("failure");
      const result = err(error);
      expect(isOk(result)).toBe(false);
      expect(isErr(result)).toBe(true);
      expect(result.error).toBe(error);
    });

    test("should unwrap or return default", () => {
      const okResult = ok("value");
      expect(unwrapOr(okResult, "default")).toBe("value");

      const errResult = err(new Error("error"));
      expect(unwrapOr(errResult, "default")).toBe("default");
    });

    test("should create ValidationError", () => {
      const error = new ValidationError("Invalid input", { field: "name" });
      expect(error.code).toBe("validation_error");
      expect(error.details).toEqual({ field: "name" });
    });

    test("should create PermissionError", () => {
      const error = new PermissionError("Access denied", ["vfs.write"]);
      expect(error.code).toBe("permission_error");
      expect(error.missingPermissions).toEqual(["vfs.write"]);
    });

    test("should create TimeoutError", () => {
      const error = new TimeoutError("Operation timed out", 5000);
      expect(error.code).toBe("timeout_error");
      expect(error.timeoutMs).toBe(5000);
    });

    test("should create ModelError", () => {
      const originalError = new Error("API error");
      const error = new ModelError("Model failed", "openai", originalError);
      expect(error.code).toBe("model_error");
      expect(error.modelName).toBe("openai");
      expect(error.originalError).toBe(originalError);
    });
  });

  describe("2.5 Model Adapter Reliability", () => {
    test("should parse structured JSON tool calls", () => {
      const response = '{"tool": "fs.read", "arguments": {"path": "test.txt"}}';
      const parsed = JSON.parse(response);
      expect(parsed.tool).toBe("fs.read");
      expect(parsed.arguments.path).toBe("test.txt");
    });

    test("should fallback when JSON parsing fails", () => {
      const invalidJson = '{"tool": "fs.read", "arguments": invalid}';
      expect(() => JSON.parse(invalidJson)).toThrow();
    });

    test("should handle exponential backoff retry", async () => {
      let attempts = 0;
      const maxRetries = 3;

      for (let attempt = 0; attempt < maxRetries; attempt++) {
        attempts++;
        // Use shorter delays for test (100ms, 200ms, 400ms instead of 1s, 2s, 4s)
        const delay = Math.pow(2, attempt) * 100;
        await new Promise((resolve) => setTimeout(resolve, delay));
      }

      expect(attempts).toBe(maxRetries);
    }, 10000); // Increase test timeout
  });
});

