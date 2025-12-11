/**
 * EventBus History Retention Tests
 * Tests for EVT-001: History growth limits
 */

import { EventBus } from "../src/core/eventBus";

describe("EventBus History Retention", () => {
  test("should limit history to maxHistorySize", () => {
    const bus = new EventBus({ maxHistorySize: 10, historyRetentionPolicy: "truncate" });

    // Emit 15 events
    for (let i = 0; i < 15; i++) {
      bus.emit("PromptEvent", { step: i });
    }

    expect(bus.history.length).toBe(10);
    // Should keep the last 10 events
    expect(bus.history[0].payload.step).toBe(5);
    expect(bus.history[9].payload.step).toBe(14);
  });

  test("should use circular buffer when policy is circular", () => {
    const bus = new EventBus({ maxHistorySize: 5, historyRetentionPolicy: "circular" });

    for (let i = 0; i < 10; i++) {
      bus.emit("PromptEvent", { step: i });
    }

    expect(bus.history.length).toBe(5);
    expect(bus.history[0].payload.step).toBe(5);
    expect(bus.history[4].payload.step).toBe(9);
  });

  test("should provide getHistory with filtering", () => {
    const bus = new EventBus({ maxHistorySize: 100 });

    const now = Date.now();
    bus.emit("PromptEvent", { step: 1 });
    bus.emit("ModelResponseEvent", { step: 2 });
    bus.emit("PromptEvent", { step: 3 });

    const promptEvents = bus.getHistory({ type: "PromptEvent" });
    expect(promptEvents.length).toBe(2);
    expect(promptEvents.every((e) => e.type === "PromptEvent")).toBe(true);

    const recent = bus.getHistory({ limit: 2 });
    expect(recent.length).toBe(2);
    expect(recent[0].payload.step).toBe(2);
    expect(recent[1].payload.step).toBe(3);
  });

  test("should default to 10000 maxHistorySize", () => {
    const bus = new EventBus();

    for (let i = 0; i < 10001; i++) {
      bus.emit("PromptEvent", { step: i });
    }

    expect(bus.history.length).toBe(10000);
  });
});

