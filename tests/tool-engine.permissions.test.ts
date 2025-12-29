/**
 * Tool Engine Permission Enforcement Tests
 * Tests for TOOL-001: Permission enforcement
 */

import { EventBus } from "../src/core/eventBus";
import { ToolEngine } from "../src/core/tool-engine";

describe("Tool Engine Permission Enforcement", () => {
  let toolEngine: ToolEngine;
  let eventBus: EventBus;

  beforeEach(() => {
    eventBus = new EventBus();
    toolEngine = new ToolEngine(eventBus);

    // Register a tool that requires vfs.write permission
    toolEngine.register(
      {
        id: "fs.write",
        name: "Write File",
        description: "Writes a file",
        runner: "builtin",
        schema: {
          type: "object",
          properties: {
            path: { type: "string" },
            content: { type: "string" },
          },
          required: ["path", "content"],
        },
        permissions: ["vfs.write"],
      },
      async (args) => {
        return { ok: true, data: { path: args.path } };
      }
    );

    // Register a tool with no permissions required
    toolEngine.register(
      {
        id: "text.uppercase",
        name: "Uppercase",
        description: "Converts text to uppercase",
        runner: "builtin",
        schema: {
          type: "object",
          properties: {
            text: { type: "string" },
          },
          required: ["text"],
        },
        permissions: [], // No permissions required
      },
      async (args) => {
        return { ok: true, data: args.text.toUpperCase() };
      }
    );
  });

  test("should allow tool execution when caller has required permissions", async () => {
    const caller = {
      id: "test-agent",
      permissions: ["vfs.write", "vfs.read"],
    };

    const result = await toolEngine.invoke("fs.write", { path: "test.txt", content: "hello" }, caller);

    expect(result.ok).toBe(true);
  });

  test("should deny tool execution when caller lacks required permissions", async () => {
    const caller = {
      id: "test-agent",
      permissions: ["vfs.read"], // Missing vfs.write
    };

    const result = await toolEngine.invoke("fs.write", { path: "test.txt", content: "hello" }, caller);

    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("insufficient_permissions");
    expect(result.error?.missing).toContain("vfs.write");
  });

  test("should deny tool execution when caller has no permissions", async () => {
    const caller = {
      id: "test-agent",
      permissions: [],
    };

    const result = await toolEngine.invoke("fs.write", { path: "test.txt", content: "hello" }, caller);

    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("insufficient_permissions");
  });

  test("should allow tool execution when no permissions are required", async () => {
    const caller = {
      id: "test-agent",
      permissions: [],
    };

    const result = await toolEngine.invoke("text.uppercase", { text: "hello" }, caller);

    expect(result.ok).toBe(true);
    expect(result.data).toBe("HELLO");
  });

  test("should emit SecurityEvent when permission is denied", async () => {
    const caller = {
      id: "test-agent",
      permissions: [],
    };

    let securityEventEmitted = false;
    eventBus.on("SecurityEvent", (evt) => {
      if (evt.payload.type === "permission_denied") {
        securityEventEmitted = true;
        expect(evt.payload.toolId).toBe("fs.write");
        expect(evt.payload.callerId).toBe("test-agent");
        expect(evt.payload.missingPermissions).toContain("vfs.write");
      }
    });

    await toolEngine.invoke("fs.write", { path: "test.txt", content: "hello" }, caller);

    expect(securityEventEmitted).toBe(true);
  });

  test("should handle anonymous caller (no permissions)", async () => {
    const result = await toolEngine.invoke("fs.write", { path: "test.txt", content: "hello" });

    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("insufficient_permissions");
  });
});
