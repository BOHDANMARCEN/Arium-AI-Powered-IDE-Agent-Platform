/**
 * Tool Engine Unit Tests
 */

import { ToolEngine } from "../src/core/tool-engine";
import { EventBus } from "../src/core/eventBus";

describe("ToolEngine", () => {
  let engine: ToolEngine;
  let eventBus: EventBus;

  beforeEach(() => {
    eventBus = new EventBus();
    engine = new ToolEngine(eventBus);
  });

  test("should register and list tools", () => {
    engine.register(
      {
        id: "test.tool",
        name: "Test Tool",
        runner: "builtin",
        schema: {
          type: "object",
          properties: { input: { type: "string" } },
          required: ["input"],
        },
      },
      async (args) => {
        return { ok: true, data: args.input.toUpperCase() };
      }
    );

    const tools = engine.list();
    expect(tools.length).toBe(1);
    expect(tools[0].id).toBe("test.tool");
  });

  test("should validate schema before execution", async () => {
    engine.register(
      {
        id: "test.validation",
        name: "Validation Test",
        runner: "builtin",
        schema: {
          type: "object",
          properties: { required: { type: "string" } },
          required: ["required"],
        },
      },
      async () => ({ ok: true })
    );

    const result = await engine.invoke("test.validation", {}, []);
    expect(result.ok).toBe(false);
    expect(result.error?.message).toContain("validation");
  });

  test("should enforce permissions", async () => {
    engine.register(
      {
        id: "test.permissioned",
        name: "Permissioned Tool",
        runner: "builtin",
        permissions: ["vfs.write"],
        schema: {},
      },
      async () => ({ ok: true })
    );

    // Without required permission
    const result1 = await engine.invoke("test.permissioned", {}, []);
    expect(result1.ok).toBe(false);
    expect(result1.error?.message).toBe("Permission denied");
    expect(result1.error?.missing).toContain("vfs.write");

    // With required permission
    const result2 = await engine.invoke("test.permissioned", {}, ["vfs.write"]);
    expect(result2.ok).toBe(true);
  });

  test("should allow tools without permissions", async () => {
    engine.register(
      {
        id: "test.no-perms",
        name: "No Permissions Tool",
        runner: "builtin",
        schema: {},
      },
      async () => ({ ok: true, data: "success" })
    );

    const result = await engine.invoke("test.no-perms", {}, []);
    expect(result.ok).toBe(true);
  });

  test("should emit ToolInvocationEvent", async () => {
    let eventEmitted = false;

    eventBus.on("ToolInvocationEvent", () => {
      eventEmitted = true;
    });

    engine.register(
      {
        id: "test.event",
        name: "Event Test",
        runner: "builtin",
        schema: {},
      },
      async () => ({ ok: true })
    );

    await engine.invoke("test.event", {}, ["vfs.read"]);
    expect(eventEmitted).toBe(true);
  });

  test("should return error for non-existent tool", async () => {
    const result = await engine.invoke("nonexistent.tool", {}, []);
    expect(result.ok).toBe(false);
    expect(result.error?.message).toBe("tool not found");
  });

  test("should emit SecurityEvent on permission violation", async () => {
    let securityEventEmitted = false;

    eventBus.on("SecurityEvent", (evt) => {
      securityEventEmitted = true;
      expect(evt.payload.toolId).toBe("test.secure");
      expect(evt.payload.missingPermissions).toContain("vfs.write");
    });

    engine.register(
      {
        id: "test.secure",
        name: "Secure Tool",
        runner: "builtin",
        permissions: ["vfs.write"],
        schema: {},
      },
      async () => ({ ok: true })
    );

    await engine.invoke("test.secure", {}, []);
    expect(securityEventEmitted).toBe(true);
  });
});
