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
import { PermissionManager } from "./permissionManager";
import { Permission } from "../agent/permissions";
import { Tool, ToolExecutionResult, ToolCaller, ToolExecutionContext } from "../types";

export type ToolRunner = <T = unknown>(
  args: Record<string, unknown>,
  ctx: ToolExecutionContext
) => Promise<ToolExecutionResult<T>>;

export interface ToolDef extends Tool {
  // ToolDef extends Tool interface for backward compatibility
}

export { ToolExecutionContext };

/**
 * Token bucket rate limiter for tool invocations
 * Implements leaky bucket algorithm
 */
class ToolRateLimiter {
  private buckets: Map<string, { tokens: number; last: number }> = new Map();
  private capacity: number;
  private refillMs: number;

  constructor(capacity: number = 10, refillMs: number = 60_000) {
    this.capacity = capacity;
    this.refillMs = refillMs;
  }

  /**
   * Check if action is allowed and consume tokens
   * @param key - Unique identifier (e.g., "callerId:toolId")
   * @param cost - Number of tokens to consume (default: 1)
   * @returns true if allowed, false if rate limit exceeded
   */
  allow(key: string, cost: number = 1): boolean {
    const now = Date.now();
    const bucket = this.buckets.get(key) ?? { tokens: this.capacity, last: now };
    const elapsed = now - bucket.last;

    // Refill tokens proportionally to elapsed time
    const refill = Math.floor((elapsed / this.refillMs) * this.capacity);
    if (refill > 0) {
      bucket.tokens = Math.min(this.capacity, bucket.tokens + refill);
      bucket.last = now;
    }

    // Check if we have enough tokens
    if (bucket.tokens >= cost) {
      bucket.tokens -= cost;
      this.buckets.set(key, bucket);
      return true;
    }

    // Not enough tokens - update bucket but deny
    this.buckets.set(key, bucket);
    return false;
  }

  /**
   * Get remaining tokens for a key
   */
  getRemaining(key: string): number {
    const bucket = this.buckets.get(key);
    if (!bucket) return this.capacity;
    return bucket.tokens;
  }

  /**
   * Cleanup old entries (call periodically)
   */
  cleanup() {
    const now = Date.now();
    const maxAge = this.refillMs * 2; // Keep entries for 2 refill periods
    for (const [key, bucket] of this.buckets.entries()) {
      if (now - bucket.last > maxAge) {
        this.buckets.delete(key);
      }
    }
  }
}

/**
 * Forbidden patterns in tool code
 * These patterns are security risks and should be rejected
 */
const FORBIDDEN_PATTERNS = [
  /(child_process|spawn|exec|fork|process\.)/i,
  /require\(['`"].*['`"]\)/i,
  /while\s*\(true\)/i,
  /eval\s*\(/i,
  /Function\s*\(/i,
];

/**
 * Validate tool code for security issues
 * @throws Error if code contains prohibited patterns or is too large
 */
function validateToolCode(code: string): void {
  // Check code size
  if (code.length > 20_000) {
    throw new Error("Tool code too large (max 20KB)");
  }

  // Check for forbidden patterns
  for (const pattern of FORBIDDEN_PATTERNS) {
    if (pattern.test(code)) {
      throw new Error(`Tool code contains prohibited pattern: ${pattern}`);
    }
  }
}

export class ToolEngine {
  private tools: Map<string, { def: ToolDef; run: ToolRunner }> = new Map();
  private ajv = new Ajv();
  private jsRunner: JSRunner;
  private pyRunner: PyRunner;
  private rateLimiter: ToolRateLimiter;
  private permissionManager: PermissionManager;

  constructor(private eventBus: EventBus) {
    this.jsRunner = new JSRunner({
      timeoutMs: parseInt(process.env.JS_RUNNER_TIMEOUT_MS || "5000", 10), // 5000ms default
      memoryLimitMb: parseInt(process.env.JS_RUNNER_MEMORY_MB || "64", 10),
    });
    
    this.pyRunner = new PyRunner({
      timeoutMs: 30000,
      maxMemoryMb: 256,
    });

    // Rate limiter: configurable capacity and refill period
    const rateLimitCapacity = parseInt(process.env.TOOL_RATE_LIMIT_CAPACITY || "20", 10);
    const rateLimitRefillMs = parseInt(process.env.TOOL_RATE_LIMIT_REFILL_MS || "60000", 10);
    this.rateLimiter = new ToolRateLimiter(rateLimitCapacity, rateLimitRefillMs);

    // Permission manager
    this.permissionManager = new PermissionManager(eventBus);

    // Cleanup rate limit store every 5 minutes
    setInterval(() => this.rateLimiter.cleanup(), 5 * 60 * 1000);
  }

  register(def: ToolDef, run: ToolRunner | string) {
    if (this.tools.has(def.id)) throw new Error("Tool already registered: " + def.id);
    
    // If run is a string (code), validate and create a sandboxed runner
    let runner: ToolRunner;
    if (typeof run === "string") {
      // Security validation: check for forbidden patterns and size
      try {
        validateToolCode(run);
      } catch (error: unknown) {
        const err = error as Error;
        throw new Error(`Tool ${def.id}: Security validation failed: ${err.message}`);
      }

      if (def.runner === "js") {
        // Validate JS code syntax
        const validation = this.jsRunner.validate(run);
        if (!validation.valid) {
          throw new Error(`Tool ${def.id}: Invalid JavaScript code: ${validation.error}`);
        }
        runner = this.jsRunner.createRunner(run, this.eventBus);
      } else if (def.runner === "py") {
        // Python validation happens in PyRunner
        runner = this.pyRunner.createRunner(run, this.eventBus);
      } else {
        throw new Error(`Tool ${def.id}: Cannot use code string with runner type "${def.runner}"`);
      }
    } else {
      runner = run;
    }
    
    // compile schema if present
    let validator: ((x: unknown) => boolean) | null = null;
    if (def.schema) {
      validator = this.ajv.compile(def.schema);
    }
    
    const wrapper: ToolRunner = async (args, ctx) => {
      if (validator && !validator(args)) {
        const errors = (validator as any).errors || [];
        const err = { ok: false, error: { message: "validation failed", errors } };
        this.eventBus.emit("ToolErrorEvent", { toolId: def.id, error: err });
        return err as ToolExecutionResult<any>;
      }
      this.eventBus.emit("ToolInvocationEvent", { toolId: def.id, args });
      try {
        const out = await runner(args, ctx);
        this.eventBus.emit("ToolResultEvent", { toolId: def.id, result: out });
        return out;
      } catch (e) {
        const err = { ok: false, error: { message: (e as Error).message, stack: (e as Error).stack } };
        this.eventBus.emit("ToolErrorEvent", { toolId: def.id, error: err });
        return err as ToolExecutionResult<any>;
      }
    };
    
    this.tools.set(def.id, { def, run: wrapper });
  }

  async invoke(
    toolId: string,
    args: Record<string, unknown>,
    caller?: { id?: string; permissions?: Permission[] }
  ): Promise<ToolExecutionResult> {
    const t = this.tools.get(toolId);
    if (!t) {
      return { ok: false, error: { message: "tool not found", toolId, code: "tool_not_found" } };
    }

    // Check rate limiting (token bucket)
    const callerId = caller?.id || "anonymous";
    const rateLimitKey = `${callerId}:${toolId}`;
    const allowed = this.rateLimiter.allow(rateLimitKey, 1);

    if (!allowed) {
      const remaining = this.rateLimiter.getRemaining(rateLimitKey);
      this.eventBus.emit("SecurityEvent", {
        type: "rate_limit_exceeded",
        toolId,
        callerId,
        remaining,
        timestamp: Date.now(),
      });

      return {
        ok: false,
        error: {
          message: "Rate limit exceeded",
          code: "rate_limit_exceeded",
          toolId,
          remaining,
        },
      };
    }

    // Check permissions using PermissionManager
    const required = t.def.permissions || [];
    const callerPerms = PermissionManager.validatePermissionStrings(
      caller?.permissions || []
    ) as Permission[];

    const permissionCheck = this.permissionManager.checkPermissions(
      required,
      callerPerms,
      {
        toolId,
        callerId: caller?.id || "anonymous",
      }
    );

    if (!permissionCheck.allowed) {
      return {
        ok: false,
        error: {
          message: "Permission denied",
          code: "insufficient_permissions",
          missing: permissionCheck.missing,
          reason: permissionCheck.reason,
          toolId,
        },
      };
    }

    return t.run(args, { eventBus: this.eventBus });
  }

  /**
   * Enhanced tool execution with sandbox telemetry
   */
  async invokeWithTelemetry(
    toolId: string,
    args: Record<string, unknown>,
    caller?: { id?: string; permissions?: Permission[] }
  ): Promise<ToolExecutionResult> {
    const startTime = Date.now();
    const startMemory = process.memoryUsage();

    // Start CPU measurement
    const startCpuUsage = process.cpuUsage();

    try {
      const result = await this.invoke(toolId, args, caller);

      // Calculate metrics
      const endTime = Date.now();
      const endMemory = process.memoryUsage();
      const endCpuUsage = process.cpuUsage(startCpuUsage);

      const executionTime = endTime - startTime;
      const memoryUsed = endMemory.heapUsed - startMemory.heapUsed;
      const cpuTime = (endCpuUsage.user + endCpuUsage.system) / 1000;

      // Emit telemetry event
      this.eventBus.emit("ToolExecutionEvent", {
        toolId,
        executionTime,
        memoryUsed,
        cpuTime,
        success: result.ok,
        error: result.ok ? undefined : result.error,
        timestamp: endTime,
      });

      return result;
    } catch (error) {
      const endTime = Date.now();
      const endMemory = process.memoryUsage();
      const endCpuUsage = process.cpuUsage(startCpuUsage);

      const executionTime = endTime - startTime;
      const memoryUsed = endMemory.heapUsed - startMemory.heapUsed;
      const cpuTime = (endCpuUsage.user + endCpuUsage.system) / 1000;

      // Emit error telemetry event
      this.eventBus.emit("ToolExecutionEvent", {
        toolId,
        executionTime,
        memoryUsed,
        cpuTime,
        success: false,
        error: {
          message: (error as Error).message,
          stack: (error as Error).stack,
        },
        timestamp: endTime,
      });

      throw error;
    }
  }

  list() {
    return Array.from(this.tools.values()).map(x => x.def);
  }
}

