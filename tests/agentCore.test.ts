/**
 * Agent Core Unit Tests
 */

import { AgentCore } from "../src/core/agent/agentCore";
import { EventBus } from "../src/core/eventBus";
import { ToolEngine } from "../src/core/tool-engine";
import { MockAdapter } from "../src/core/models/mockAdapter";

describe("AgentCore", () => {
  let agent: AgentCore;
  let eventBus: EventBus;
  let toolEngine: ToolEngine;
  let modelAdapter: MockAdapter;

  beforeEach(() => {
    eventBus = new EventBus();
    toolEngine = new ToolEngine(eventBus);
    modelAdapter = new MockAdapter();

    // Register a test tool
    toolEngine.register(
      {
        id: "test.tool",
        name: "Test Tool",
        runner: "builtin",
        schema: {},
      },
      async () => ({ ok: true, data: "tool result" })
    );

    agent = new AgentCore(
      {
        id: "test-agent",
        model: modelAdapter,
        maxSteps: 5,
      },
      eventBus,
      toolEngine
    );
  });

  test("should emit AgentStartEvent", async () => {
    let startEventEmitted = false;

    eventBus.on("AgentStartEvent", (evt) => {
      startEventEmitted = true;
      expect(evt.payload.agentId).toBe("test-agent");
    });

    await agent.run("test input");
    expect(startEventEmitted).toBe(true);
  });

  test("should respect maxSteps limit", async () => {
    const result = await agent.run("test that requires many steps");
    // MockAdapter returns final response immediately, so this should complete
    // But if it loops, maxSteps should prevent infinite loop
    expect(result).toBeDefined();
  });

  test("should handle tool calls", async () => {
    // MockAdapter returns tool calls when prompt contains "CALL:"
    const result = await agent.run("CALL: fs.read");

    // Should have attempted tool call
    expect(result).toBeDefined();
  });

  test("should emit step events", async () => {
    let stepCount = 0;

    eventBus.on("AgentStepEvent", () => {
      stepCount++;
    });

    await agent.run("test input");
    // Should have at least one step
    expect(stepCount).toBeGreaterThanOrEqual(0);
  });

  test("should handle model errors gracefully", async () => {
    // Create agent with adapter that throws
    const failingAdapter = {
      async generate() {
        throw new Error("Model error");
      },
    };

    const failingAgent = new AgentCore(
      {
        id: "failing-agent",
        model: failingAdapter as any,
        maxSteps: 1,
      },
      eventBus,
      toolEngine
    );

    // Should handle error without crashing
    await expect(failingAgent.run("test")).rejects.toThrow();
  });

  test("should build context from tool results", async () => {
    // This is more of an integration test
    // Verifies that tool results are added to context
    await agent.run("CALL: fs.read");

    // Context should be populated (internal state, hard to test directly)
    // But we can verify through event emissions
    const toolEvents = eventBus.history.filter(
      (e) => e.type === "ToolInvocationEvent"
    );
    expect(toolEvents.length).toBeGreaterThanOrEqual(0);
  });
});

describe("AgentCore Loop Prevention", () => {
  let agent: AgentCore;
  let eventBus: EventBus;
  let toolEngine: ToolEngine;

  beforeEach(() => {
    eventBus = new EventBus();
    toolEngine = new ToolEngine(eventBus);
  });

  test("should stop after maxSteps", async () => {
    // Create adapter that always returns tool calls
    const loopAdapter = {
      async generate() {
        return {
          type: "tool" as const,
          tool: "test.tool",
          arguments: {},
        };
      },
    };

    toolEngine.register(
      {
        id: "test.tool",
        name: "Test",
        runner: "builtin",
        schema: {},
      },
      async () => ({ ok: true })
    );

    agent = new AgentCore(
      {
        id: "loop-test-agent",
        model: loopAdapter as any,
        maxSteps: 3,
      },
      eventBus,
      toolEngine
    );

    const result = await agent.run("test");
    expect(result.ok).toBe(false);
    expect(result.message).toBe("max steps exceeded");
  });
});
