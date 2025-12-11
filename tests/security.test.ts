/**
 * Security tests for Arium
 * Tests critical security features: sandboxing, permissions, path traversal, authentication
 * 
 * Author: Bogdan Marcen & ChatGPT 5.1
 */

import { JSRunner } from "../src/core/tool-engine/runners/jsRunner";
import { EventBus } from "../src/core/eventBus";
import { ToolEngine } from "../src/core/tool-engine";
import { VFS } from "../src/core/vfs";
import { PersistentVFS } from "../src/core/storage/persistentVFS";
import { PathTraversalError } from "../src/core/errors";
import { isAllowed, getMissingPermissions, DEFAULT_LEAST_PRIVILEGE, Permission } from "../src/core/agent/permissions";
import { signToken, verifyToken, extractToken } from "../src/server/auth";

describe("Security Tests", () => {
  describe("JS Runner Security", () => {
    let runner: JSRunner;
    let eventBus: EventBus;

    beforeEach(() => {
      eventBus = new EventBus();
      runner = new JSRunner({
        timeoutMs: 1000,
        memoryLimitMb: 64,
      });
    });

    test("should reject code with child_process", async () => {
      const maliciousCode = `
        const { spawn } = require('child_process');
        spawn('rm', ['-rf', '/']);
      `;

      const toolRunner = runner.createRunner(maliciousCode, eventBus);
      const result = await toolRunner({}, { eventBus });

      expect(result.ok).toBe(false);
      expect(result.error?.message).toContain("Prohibited");
    });

    test("should reject code with process.exit", async () => {
      const maliciousCode = `
        process.exit(0);
      `;

      const validation = runner.validate(maliciousCode);
      expect(validation.valid).toBe(false);
    });

    test("should reject code with eval", async () => {
      const maliciousCode = `
        eval('malicious code');
      `;

      const validation = runner.validate(maliciousCode);
      expect(validation.valid).toBe(false);
    });

    test("should reject code with require", async () => {
      const maliciousCode = `
        require('fs').readFileSync('/etc/passwd');
      `;

      const validation = runner.validate(maliciousCode);
      expect(validation.valid).toBe(false);
    });

    test("should reject code larger than 20KB", () => {
      const largeCode = "a".repeat(21_000);
      const validation = runner.validate(largeCode);
      expect(validation.valid).toBe(false);
    });

    test("should allow safe code", async () => {
      const safeCode = `
        async function run(args) {
          return { ok: true, data: { result: args.input * 2 } };
        }
      `;

      const toolRunner = runner.createRunner(safeCode, eventBus);
      const result = await toolRunner({ input: 5 }, { eventBus });

      expect(result.ok).toBe(true);
      expect(result.data.result).toBe(10);
    });
  });

  describe("VFS Path Traversal Protection", () => {
    let eventBus: EventBus;
    let vfs: VFS;

    beforeEach(() => {
      eventBus = new EventBus();
      vfs = new VFS(eventBus);
    });

    test("should reject paths with ..", () => {
      expect(() => {
        vfs.write("../etc/passwd", "malicious");
      }).toThrow(PathTraversalError);
    });

    test("should reject absolute paths", () => {
      expect(() => {
        vfs.write("/etc/passwd", "malicious");
      }).toThrow(PathTraversalError);
    });

    test("should reject Windows absolute paths", () => {
      expect(() => {
        vfs.write("C:\\Windows\\System32", "malicious");
      }).toThrow(PathTraversalError);
    });

    test("should reject encoded traversal sequences", async () => {
      const persistentVFS = new PersistentVFS(eventBus, {
        workspacePath: "./test-workspace",
        projectId: "test",
      });
      await persistentVFS.initialize();

      expect(() => {
        persistentVFS.write("%2e%2e%2fetc%2fpasswd", "malicious");
      }).toThrow(PathTraversalError);

      // Cleanup
      await persistentVFS.delete("test-file", "test");
    });

    test("should allow safe relative paths", () => {
      expect(() => {
        vfs.write("src/main.ts", "safe content");
      }).not.toThrow();
    });
  });

  describe("Permissions System", () => {
    test("should check permissions correctly", () => {
      const required: Permission[] = ["vfs.read", "vfs.write"];
      const granted: Permission[] = ["vfs.read", "vfs.write", "net.fetch"];

      expect(isAllowed(required, granted)).toBe(true);
    });

    test("should detect missing permissions", () => {
      const required: Permission[] = ["vfs.read", "vfs.write"];
      const granted: Permission[] = ["vfs.read"];

      expect(isAllowed(required, granted)).toBe(false);
      expect(getMissingPermissions(required, granted)).toEqual(["vfs.write"]);
    });

    test("should use least privilege by default", () => {
      expect(DEFAULT_LEAST_PRIVILEGE).toEqual(["vfs.read"]);
      expect(DEFAULT_LEAST_PRIVILEGE.length).toBe(1);
    });
  });

  describe("Tool Engine Permissions", () => {
    let toolEngine: ToolEngine;
    let eventBus: EventBus;

    beforeEach(() => {
      eventBus = new EventBus();
      toolEngine = new ToolEngine(eventBus);

      // Register a tool that requires permissions
      toolEngine.register(
        {
          id: "test.write",
          name: "Test Write",
          description: "Test tool requiring write permission",
          runner: "builtin",
          permissions: ["vfs.write"],
        },
        async (args) => {
          return { ok: true, data: { written: true } };
        }
      );
    });

    test("should deny tool execution without required permissions", async () => {
      const result = await toolEngine.invoke("test.write", {}, {
        id: "test-agent",
        permissions: ["vfs.read"], // Missing vfs.write
      });

      expect(result.ok).toBe(false);
      expect(result.error?.code).toBe("insufficient_permissions");
    });

    test("should allow tool execution with required permissions", async () => {
      const result = await toolEngine.invoke("test.write", {}, {
        id: "test-agent",
        permissions: ["vfs.read", "vfs.write"],
      });

      expect(result.ok).toBe(true);
    });

    test("should deny anonymous caller", async () => {
      const result = await toolEngine.invoke("test.write", {}, undefined);

      expect(result.ok).toBe(false);
      expect(result.error?.code).toBe("insufficient_permissions");
    });
  });

  describe("JWT Authentication", () => {
    const secret = "test-secret-key";

    test("should sign and verify token", () => {
      const payload = { id: "user123", permissions: ["vfs.read"] };
      const token = signToken(payload, secret);
      
      expect(token).toBeTruthy();
      expect(typeof token).toBe("string");

      const decoded = verifyToken(token, secret);
      expect(decoded.id).toBe("user123");
      expect(decoded.permissions).toEqual(["vfs.read"]);
    });

    test("should reject invalid token", () => {
      expect(() => {
        verifyToken("invalid.token.here", secret);
      }).toThrow();
    });

    test("should reject expired token", () => {
      const payload = { id: "user123" };
      const token = signToken(payload, secret, { expiresIn: "1ms" });
      
      // Wait for token to expire
      return new Promise((resolve) => {
        setTimeout(() => {
          expect(() => {
            verifyToken(token, secret);
          }).toThrow("Token expired");
          resolve(undefined);
        }, 10);
      });
    });

    test("should extract token from query string", () => {
      const token = "test-token-123";
      const req = {
        url: `http://localhost:3000/ws?token=${token}`,
        headers: { host: "localhost:3000" },
      };

      const extracted = extractToken(req as any);
      expect(extracted).toBe(token);
    });

    test("should extract token from Authorization header", () => {
      const token = "test-token-123";
      const req = {
        url: "http://localhost:3000/ws",
        headers: {
          authorization: `Bearer ${token}`,
        },
      };

      const extracted = extractToken(req as any);
      expect(extracted).toBe(token);
    });

    test("should return null if no token found", () => {
      const req = {
        url: "http://localhost:3000/ws",
        headers: {},
      };

      const extracted = extractToken(req as any);
      expect(extracted).toBeNull();
    });
  });

  describe("Rate Limiting", () => {
    let toolEngine: ToolEngine;
    let eventBus: EventBus;

    beforeEach(() => {
      eventBus = new EventBus();
      toolEngine = new ToolEngine(eventBus);

      toolEngine.register(
        {
          id: "test.tool",
          name: "Test Tool",
          runner: "builtin",
        },
        async () => ({ ok: true })
      );
    });

    test("should enforce rate limits", async () => {
      const caller = { id: "rate-test", permissions: [] };
      
      // Make many rapid calls
      const promises = Array(30).fill(0).map(() =>
        toolEngine.invoke("test.tool", {}, caller)
      );

      const results = await Promise.all(promises);
      
      // Some should be rate limited
      const rateLimited = results.filter(r => 
        r.error?.code === "rate_limit_exceeded"
      );
      
      expect(rateLimited.length).toBeGreaterThan(0);
    });
  });
});
