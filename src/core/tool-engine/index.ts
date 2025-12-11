/**
 * Minimal Tool Engine:
 * - register tool definitions
 * - validate payload shape (very light)
 * - call runner functions (builtin JS in-process)
 * - support sandboxed JS runners
 *
 * Extend runners to spawn sandboxed Node/Deno/Python processes.
 */

import Ajv, { JSONSchemaType } from "ajv";
import { EventBus } from "../eventBus";
import { JSRunner } from "./runners/jsRunner";
import { PyRunner } from "./runners/pyRunner";

export type ToolRunner = (args: any, ctx: { eventBus: EventBus }) => Promise<{ ok: boolean; data?: any; error?: any }>;

export interface ToolDef {
  id: string;
  name: string;
  description?: string;
  runner: "builtin" | "js" | "py";
  schema?: any;
  permissions?: string[];
}

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

class ToolRateLimiter {
  private store: Map<string, RateLimitEntry> = new Map();
  private windowMs: number;
  private maxCalls: number;

  constructor(windowMs: number, maxCalls: number) {
    this.windowMs = windowMs;
    this.maxCalls = maxCalls;
  }

  check(identifier: string): { allowed: boolean; remaining: number; resetTime: number } {
    const now = Date.now();
    const entry = this.store.get(identifier);

    if (!entry || now > entry.resetTime) {
      // New window
      this.store.set(identifier, {
        count: 1,
        resetTime: now + this.windowMs,
      });
      return {
        allowed: true,
        remaining: this.maxCalls - 1,
        resetTime: now + this.windowMs,
      };
    }

    if (entry.count >= this.maxCalls) {
      return {
        allowed: false,
        remaining: 0,
        resetTime: entry.resetTime,
      };
    }

    entry.count++;
    return {
      allowed: true,
      remaining: this.maxCalls - entry.count,
      resetTime: entry.resetTime,
    };
  }

  cleanup() {
    const now = Date.now();
    for (const [key, entry] of this.store.entries()) {
      if (entry.resetTime < now) {
        this.store.delete(key);
      }
    }
  }
}

export class ToolEngine {
  private tools: Map<string, { def: ToolDef; run: ToolRunner }> = new Map();
  private ajv = new Ajv();
  private jsRunner: JSRunner;
  private pyRunner: PyRunner;
  private rateLimiter: ToolRateLimiter;

  constructor(private eventBus: EventBus) {
    this.jsRunner = new JSRunner({
      timeout: 30000,
      memoryLimit: 256 * 1024 * 1024,
    });
    
    this.pyRunner = new PyRunner({
      timeout: 30000,
      maxMemoryMB: 256,
    });

    // Rate limiter: 10 calls per second per caller (configurable)
    const rateLimitPerSec = parseInt(process.env.TOOL_RATE_LIMIT_PER_SEC || "10", 10);
    this.rateLimiter = new ToolRateLimiter(1000, rateLimitPerSec);

    // Cleanup rate limit store every 5 minutes
    setInterval(() => this.rateLimiter.cleanup(), 5 * 60 * 1000);
  }

  register(def: ToolDef, run: ToolRunner | string) {
    if (this.tools.has(def.id)) throw new Error("Tool already registered: " + def.id);
    
    // If run is a string (code), create a sandboxed runner
    let runner: ToolRunner;
    if (typeof run === "string") {
      if (def.runner === "js") {
        // Validate JS code
        const validation = this.jsRunner.validate(run);
        if (!validation.valid) {
          throw new Error(`Tool ${def.id}: Invalid JavaScript code: ${validation.error}`);
        }
        runner = this.jsRunner.createRunner(run, this.eventBus);
      } else if (def.runner === "py") {
        // Validate Python code (async)
        // Note: We'll validate synchronously for now, async validation would need refactoring
        runner = this.pyRunner.createRunner(run, this.eventBus);
      } else {
        throw new Error(`Tool ${def.id}: Cannot use code string with runner type "${def.runner}"`);
      }
    } else {
      runner = run;
    }
    
    // compile schema if present
    let validator: ((x: any) => boolean) | null = null;
    if (def.schema) {
      validator = this.ajv.compile(def.schema);
    }
    
    const wrapper: ToolRunner = async (args, ctx) => {
      if (validator && !validator(args)) {
        const errors = (validator as any).errors || [];
        const err = { ok: false, error: { message: "validation failed", errors } };
        this.eventBus.emit("ToolErrorEvent", { toolId: def.id, error: err });
        return err;
      }
      this.eventBus.emit("ToolInvocationEvent", { toolId: def.id, args });
      try {
        const out = await runner(args, ctx);
        this.eventBus.emit("ToolResultEvent", { toolId: def.id, result: out });
        return out;
      } catch (e) {
        const err = { ok: false, error: { message: (e as Error).message, stack: (e as Error).stack } };
        this.eventBus.emit("ToolErrorEvent", { toolId: def.id, error: err });
        return err;
      }
    };
    
    this.tools.set(def.id, { def, run: wrapper });
  }

  async invoke(toolId: string, args: any, caller?: { id?: string; permissions?: string[] }) {
    const t = this.tools.get(toolId);
    if (!t) {
      return { ok: false, error: { message: "tool not found", toolId, code: "tool_not_found" } };
    }

    // Check rate limiting
    const callerId = caller?.id || "anonymous";
    const rateLimitKey = `${callerId}:${toolId}`;
    const rateLimitResult = this.rateLimiter.check(rateLimitKey);

    if (!rateLimitResult.allowed) {
      this.eventBus.emit("SecurityEvent", {
        type: "rate_limit_exceeded",
        toolId,
        callerId,
        timestamp: Date.now(),
      });

      return {
        ok: false,
        error: {
          message: "Rate limit exceeded",
          code: "rate_limit_exceeded",
          toolId,
          resetTime: rateLimitResult.resetTime,
        },
      };
    }

    // Check permissions
    const required = t.def.permissions || [];
    const callerPerms = caller?.permissions || [];
    const missing = required.filter((p: string) => !callerPerms.includes(p));

    if (missing.length > 0) {
      // Emit security event
      this.eventBus.emit("SecurityEvent", {
        type: "permission_denied",
        toolId,
        callerId: caller?.id || "unknown",
        missingPermissions: missing,
        requestedTool: toolId,
        timestamp: Date.now(),
      });

      return {
        ok: false,
        error: {
          message: "Permission denied",
          code: "insufficient_permissions",
          missing,
          toolId,
        },
      };
    }

    return t.run(args, { eventBus: this.eventBus });
  }

  list() {
    return Array.from(this.tools.values()).map(x => x.def);
  }
}

