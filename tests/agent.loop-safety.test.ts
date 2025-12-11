/**
 * Agent Loop Safety Tests
 * Tests for AGENT-001, AGENT-002: Loop detection, timeouts, context bounding
 */

import { EventBus } from "../src/core/eventBus";
import { ToolEngine } from "../src/core/tool-engine";
import { AgentCore } from "../src/core/agent/agentCore";
import { AgentLoopError } from "../src/core/errors";

describe("Agent Loop Safety", () => {
  let agent: AgentCore;
  let eventBus: EventBus;
  let toolEngine: ToolEngine;

  beforeEach(() => {
    eventBus = new EventBus();
    toolEngine = new ToolEngine(eventBus);

    // Register a test tool
    toolEngine.register(
      {
        id: "test.tool",
        name: "Test Tool",
        runner: "builtin",
        schema: {},
        permissions: [],
      },
      async () => ({ ok: true, data: "tool result" })
    );
  });

  test("should detect and abort on repeated tool calls", async () => {
    // Create adapter that always returns the same tool call
    const loopAdapter = {
      async generate() {
        return {
          type: "tool" as const,
          tool: "test.tool",
          arguments: {},
        };
      },
    };

    agent = new AgentCore(
      {
        id: "loop-test-agent",
        model: loopAdapter as any,
        maxSteps: 10,
        maxContextSize: 20,
      },
      eventBus,
      toolEngine
    );

    await expect(agent.run("test")).rejects.toThrow(AgentLoopError);
  });

  test("should respect maxSteps limit", async () => {
    // Create adapter that always returns tool calls (but different ones)
    let callCount = 0;
    const toolAdapter = {
      async generate() {
        callCount++;
        return {
          type: "tool" as const,
          tool: `test.tool.${callCount}`,
          arguments: {},
        };
      },
    };

    // Register multiple tools
    for (let i = 1; i <= 5; i++) {
      toolEngine.register(
        {
          id: `test.tool.${i}`,
          name: `Test Tool ${i}`,
          runner: "builtin",
          schema: {},
          permissions: [],
        },
        async () => ({ ok: true, data: `result ${i}` })
      );
    }

    agent = new AgentCore(
      {
        id: "maxsteps-test-agent",
        model: toolAdapter as any,
        maxSteps: 3,
      },
      eventBus,
      toolEngine
    );

    const result = await agent.run("test");
    expect(result.ok).toBe(false);
    expect((result as any).message).toBe("max steps exceeded");
  });

  test("should handle step timeout", async () => {
    // Create adapter that takes too long
    const slowAdapter = {
      async generate() {
        await new Promise((resolve) => setTimeout(resolve, 40000)); // 40 seconds
        return {
          type: "final" as const,
          content: "done",
        };
      },
    };

    agent = new AgentCore(
      {
        id: "timeout-test-agent",
        model: slowAdapter as any,
        maxSteps: 5,
        stepTimeoutMs: 1000, // 1 second timeout
        maxConsecutiveFailures: 2,
      },
      eventBus,
      toolEngine
    );

    await expect(agent.run("test")).rejects.toThrow(AgentLoopError);
  });

  test("should bound context size", async () => {
    // Create adapter that returns tool calls
    let step = 0;
    const toolAdapter = {
      async generate() {
        step++;
        if (step > 10) {
          return {
            type: "final" as const,
            content: "done",
          };
        }
        return {
          type: "tool" as const,
          tool: "test.tool",
          arguments: { step },
        };
      },
    };

    agent = new AgentCore(
      {
        id: "context-test-agent",
        model: toolAdapter as any,
        maxSteps: 20,
        maxContextSize: 10, // Small context
        contextSummarizationThreshold: 8,
      },
      eventBus,
      toolEngine
    );

    let contextSummarized = false;
    eventBus.on("AgentStepEvent", (evt) => {
      if (evt.payload.action === "context_summarized") {
        contextSummarized = true;
      }
    });

    await agent.run("test");

    // Context should have been summarized
    expect(contextSummarized).toBe(true);
  });

  test("should abort on too many consecutive failures", async () => {
    // Create adapter that returns tool calls, but tool always fails
    toolEngine.register(
      {
        id: "failing.tool",
        name: "Failing Tool",
        runner: "builtin",
        schema: {},
        permissions: [],
      },
      async () => ({ ok: false, error: { message: "Tool failed" } })
    );

    const toolAdapter = {
      async generate() {
        return {
          type: "tool" as const,
          tool: "failing.tool",
          arguments: {},
        };
      },
    };

    agent = new AgentCore(
      {
        id: "failure-test-agent",
        model: toolAdapter as any,
        maxSteps: 10,
        maxConsecutiveFailures: 3,
      },
      eventBus,
      toolEngine
    );

    await expect(agent.run("test")).rejects.toThrow(AgentLoopError);
  });
});
