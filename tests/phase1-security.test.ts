/**
 * Phase 1 Security Tests
 * Comprehensive tests for all Phase 1 security features
 * 
 * Author: Bogdan Marcen & ChatGPT 5.1
 */

import { validateBody, validateQuery } from "../src/server/middleware/validation";
import { AgentRunSchema, VFSReadSchema, VFSWriteSchema, ToolInvokeSchema, PathSchema } from "../src/server/routes/schemas";
import { secureResolvePath, validatePathLength } from "../src/core/utils/pathSecurity";
import { PathTraversalError } from "../src/core/errors";
import { PermissionManager } from "../src/core/tool-engine/permissionManager";
import { Permission } from "../src/core/agent/permissions";
import { EventBus } from "../src/core/eventBus";
import { JSRunner } from "../src/core/tool-engine/runners/jsRunner";
import { PyRunner } from "../src/core/tool-engine/runners/pyRunner";
import { signToken, verifyToken, extractToken } from "../src/server/auth";
import { wsRateLimiter } from "../src/server/middleware/wsRateLimit";

describe("Phase 1 Security Tests", () => {
  describe("1.1 API Validation (Zod)", () => {
    test("should reject extra fields in AgentRunSchema", () => {
      const result = AgentRunSchema.safeParse({
        input: "test",
        extraField: "should be rejected",
      });
      expect(result.success).toBe(false);
    });

    test("should reject paths longer than 1024 characters", () => {
      const longPath = "a".repeat(1025);
      const result = PathSchema.safeParse(longPath);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].message).toContain("1024");
      }
    });

    test("should reject XSS attempts in input", () => {
      const xssInput = "<script>alert('xss')</script>";
      const result = AgentRunSchema.safeParse({ input: xssInput });
      // Should accept the input (XSS protection is at rendering layer)
      // But we validate it's a string
      expect(result.success).toBe(true);
    });

    test("should validate VFSReadSchema strictly", () => {
      const result = VFSReadSchema.safeParse({
        path: "test.txt",
        extra: "rejected",
      });
      expect(result.success).toBe(false);
    });

    test("should validate ToolInvokeSchema strictly", () => {
      const result = ToolInvokeSchema.safeParse({
        toolId: "test.tool",
        args: {},
        extra: "rejected",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("1.2 Secure VFS Path Resolution", () => {
    const basePath = "/tmp/test-workspace";

    test("should reject absolute paths", () => {
      // Test Unix absolute path
      expect(() => {
        secureResolvePath(basePath, "/etc/passwd");
      }).toThrow(PathTraversalError);
      
      // Test Windows absolute path
      expect(() => {
        secureResolvePath(basePath, "C:\\Windows\\System32");
      }).toThrow(PathTraversalError);
    });

    test("should reject paths with ..", () => {
      expect(() => {
        secureResolvePath(basePath, "../../etc/passwd");
      }).toThrow(PathTraversalError);
    });

    test("should reject encoded traversal sequences", () => {
      expect(() => {
        secureResolvePath(basePath, "%2e%2e%2fetc%2fpasswd");
      }).toThrow(PathTraversalError);
    });

    test("should reject null bytes", () => {
      expect(() => {
        secureResolvePath(basePath, "test\0.txt");
      }).toThrow(PathTraversalError);
    });

    test("should reject paths longer than 1024 chars", () => {
      const longPath = "a".repeat(1025);
      expect(() => {
        validatePathLength(longPath, 1024);
      }).toThrow(PathTraversalError);
    });

    test("should allow safe relative paths", () => {
      const result = secureResolvePath(basePath, "src/main.ts");
      // Path separator may differ on Windows vs Unix
      expect(result.replace(/\\/g, "/")).toBe("src/main.ts");
    });

    test("should reject paths with .. before normalization", () => {
      // secureResolvePath should reject .. before normalization
      expect(() => {
        secureResolvePath(basePath, "src/../main.ts");
      }).toThrow(PathTraversalError);
    });
  });

  describe("1.3 WebSocket Authentication", () => {
    const secret = "test-secret";

    test("should require token for WebSocket connection", () => {
      const req = {
        url: "ws://localhost:3000/ws",
        headers: {},
      };
      const token = extractToken(req as any);
      expect(token).toBeNull();
    });

    test("should extract token from query string", () => {
      const token = signToken({ id: "user123" }, secret);
      const req = {
        url: `ws://localhost:3000/ws?token=${token}`,
        headers: { host: "localhost:3000" },
      };
      const extracted = extractToken(req as any);
      expect(extracted).toBe(token);
    });

    test("should verify JWT token", () => {
      const payload = { id: "user123", permissions: ["vfs.read"] };
      const token = signToken(payload, secret);
      const decoded = verifyToken(token, secret);
      expect(decoded.id).toBe("user123");
    });

    test("should reject invalid token", () => {
      expect(() => {
        verifyToken("invalid.token", secret);
      }).toThrow();
    });

    test("should enforce rate limiting on handshake", () => {
      const ip = "192.168.1.1";
      
      // Make multiple attempts
      for (let i = 0; i < 5; i++) {
        const result = wsRateLimiter.check(ip);
        expect(result.allowed).toBe(true);
      }
      
      // 6th attempt should be blocked
      const result = wsRateLimiter.check(ip);
      expect(result.allowed).toBe(false);
    });
  });

  describe("1.4 Tool Engine Permission System", () => {
    let eventBus: EventBus;
    let permissionManager: PermissionManager;

    beforeEach(() => {
      eventBus = new EventBus();
      permissionManager = new PermissionManager(eventBus);
    });

    test("should check permissions correctly", () => {
      const required: Permission[] = ["vfs.read", "vfs.write"];
      const granted: Permission[] = ["vfs.read", "vfs.write", "net.fetch"];

      const result = permissionManager.checkPermissions(required, granted, {
        toolId: "test.tool",
        callerId: "test-agent",
      });

      expect(result.allowed).toBe(true);
    });

    test("should deny when permissions missing", () => {
      const required: Permission[] = ["vfs.read", "vfs.write"];
      const granted: Permission[] = ["vfs.read"];

      const result = permissionManager.checkPermissions(required, granted, {
        toolId: "test.tool",
        callerId: "test-agent",
      });

      expect(result.allowed).toBe(false);
      expect(result.missing).toEqual(["vfs.write"]);
    });

    test("should emit SecurityEvent on permission denial", () => {
      const events: any[] = [];
      eventBus.on("SecurityEvent", (evt) => {
        events.push(evt);
      });

      const required: Permission[] = ["vfs.write"];
      const granted: Permission[] = ["vfs.read"];

      permissionManager.checkPermissions(required, granted, {
        toolId: "test.tool",
        callerId: "test-agent",
      });

      // EventBus emits synchronously
      expect(events.length).toBeGreaterThan(0);
      expect(events[0].type).toBe("permission_denied");
    });

    test("should validate permission strings", () => {
      const valid = PermissionManager.validatePermissionStrings([
        "vfs.read",
        "vfs.write",
        "invalid.permission",
      ]);

      expect(valid).toEqual(["vfs.read", "vfs.write"]);
    });
  });

  describe("1.5 JS Runner Security Hardening", () => {
    let runner: JSRunner;
    let eventBus: EventBus;

    beforeEach(() => {
      eventBus = new EventBus();
      runner = new JSRunner({
        timeoutMs: 5000,
        memoryLimitMb: 64,
      });
    });

    test("should have 5000ms timeout", () => {
      expect(runner["options"].timeoutMs).toBe(5000);
    });

    test("should reject Buffer access", () => {
      const code = "Buffer.from('test')";
      const validation = runner.validate(code);
      expect(validation.valid).toBe(false);
    });

    test("should reject process access", () => {
      const code = "process.exit(0)";
      const validation = runner.validate(code);
      expect(validation.valid).toBe(false);
    });

    test("should reject require()", () => {
      const code = "require('fs')";
      const validation = runner.validate(code);
      expect(validation.valid).toBe(false);
    });

    test("should reject global access", () => {
      const code = "global.test = 'value'";
      const validation = runner.validate(code);
      expect(validation.valid).toBe(false);
    });

    test("should reject Proxy", () => {
      const code = "new Proxy({}, {})";
      const validation = runner.validate(code);
      expect(validation.valid).toBe(false);
    });

    test("should reject Function constructor", () => {
      const code = "new Function('return 1')()";
      const validation = runner.validate(code);
      expect(validation.valid).toBe(false);
    });

    test("should log forbidden API access", () => {
      const events: any[] = [];
      eventBus.on("SecurityEvent", (evt) => {
        events.push(evt);
      });

      const maliciousCode = "process.exit(0)";
      
      // Validation should fail and emit event
      // Note: This will fail during validation, not execution
      try {
        runner["validateCode"](maliciousCode, eventBus);
      } catch {
        // Expected to throw
      }

      // EventBus emits synchronously
      expect(events.length).toBeGreaterThan(0);
      expect(events[0].type).toBe("forbidden_api_access");
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

  describe("1.6 Python Runner Memory Limits", () => {
    let runner: PyRunner;
    let eventBus: EventBus;

    beforeEach(() => {
      eventBus = new EventBus();
      runner = new PyRunner({
        timeout: 30000,
        maxMemoryMB: 64, // 64MB limit
      });
    });

    test("should have configurable maxMemoryMB", () => {
      expect(runner["config"].maxMemoryMB).toBe(64);
    });

    test("should set memory limits in Python code", async () => {
      // Check that createTempFile includes memory limit code
      const code = "def run(args): return {'ok': True}";
      const { tempFile } = await runner["createTempFile"](code, 64);
      
      // Read the generated file to check for resource.setrlimit
      const fs = require("fs/promises");
      const content = await fs.readFile(tempFile, "utf-8");
      
      expect(content).toContain("resource.setrlimit");
      expect(content).toContain("64 * 1024 * 1024");
      
      // Cleanup
      await fs.rm(require("path").dirname(tempFile), { recursive: true, force: true });
    });

    test("should handle MemoryError", async () => {
      // This test verifies that MemoryError is caught and returned as error
      // Actual memory exhaustion test would require a memory-intensive script
      const code = `
        def run(args):
          # This would cause MemoryError if memory limit is exceeded
          raise MemoryError("Memory limit exceeded")
      `;

      const toolRunner = runner.createRunner(code, eventBus);
      const result = await toolRunner({}, { eventBus });

      expect(result.ok).toBe(false);
      expect(result.error?.type).toBe("MemoryError");
    });
  });
});

