/**
 * EventBus Unit Tests
 */

import { EventBus, EventType } from "../src/core/eventBus";

describe("EventBus", () => {
  let bus: EventBus;

  beforeEach(() => {
    bus = new EventBus();
  });

  test("should emit and record events", () => {
    let triggered = false;
    let receivedPayload: any = null;

    bus.on("PromptEvent", (evt) => {
      triggered = true;
      receivedPayload = evt.payload;
    });

    const payload = { msg: "hello" };
    bus.emit("PromptEvent", payload);

    expect(triggered).toBe(true);
    expect(receivedPayload).toEqual(payload);
    expect(bus.history.length).toBe(1);
    expect(bus.history[0].type).toBe("PromptEvent");
  });

  test("should notify 'any' listeners", () => {
    let triggered = false;

    bus.on("any", () => {
      triggered = true;
    });

    bus.emit("VFSChangeEvent", { path: "test.txt" });

    expect(triggered).toBe(true);
  });

  test("should support removing listeners", () => {
    let callCount = 0;

    const listener = () => {
      callCount++;
    };

    bus.on("PromptEvent", listener);
    bus.emit("PromptEvent", {});
    expect(callCount).toBe(1);

    bus.off("PromptEvent", listener);
    bus.emit("PromptEvent", {});
    expect(callCount).toBe(1); // Should not increment
  });

  test("should handle listener errors gracefully", () => {
    bus.on("PromptEvent", () => {
      throw new Error("Listener error");
    });

    // Should not throw
    expect(() => {
      bus.emit("PromptEvent", {});
    }).not.toThrow();
  });

  test("should maintain append-only history", () => {
    bus.emit("PromptEvent", { step: 1 });
    bus.emit("ModelResponseEvent", { step: 2 });
    bus.emit("ToolInvocationEvent", { step: 3 });

    expect(bus.history.length).toBe(3);
    expect(bus.history[0].payload.step).toBe(1);
    expect(bus.history[1].payload.step).toBe(2);
    expect(bus.history[2].payload.step).toBe(3);
  });
});
