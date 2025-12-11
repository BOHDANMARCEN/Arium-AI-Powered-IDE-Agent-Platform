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

export class ToolEngine {
  private tools: Map<string, { def: ToolDef; run: ToolRunner }> = new Map();
  private ajv = new Ajv();
  private jsRunner: JSRunner;
  private pyRunner: PyRunner;

  constructor(private eventBus: EventBus) {
    this.jsRunner = new JSRunner({
      timeout: 30000,
      memoryLimit: 256 * 1024 * 1024,
    });
    
    this.pyRunner = new PyRunner({
      timeout: 30000,
      maxMemoryMB: 256,
    });
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
        const err = { ok: false, error: { message: "validation failed", errors: validator.errors } };
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

  async invoke(toolId: string, args: any) {
    const t = this.tools.get(toolId);
    if (!t) return { ok: false, error: { message: "tool not found", toolId } };
    return t.run(args, { eventBus: this.eventBus });
  }

  list() {
    return Array.from(this.tools.values()).map(x => x.def);
  }
}

