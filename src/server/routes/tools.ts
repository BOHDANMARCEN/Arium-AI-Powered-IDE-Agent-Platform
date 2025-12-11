import { Router, Request, Response } from "express";
import { ToolInvokeSchema } from "./schemas";
import { validateBody } from "../middleware/validation";
import { ValidationError } from "../../core/errors";

export function toolsRoutes(engine: any) {
  const r = Router();

  r.get("/list", (req, res) => {
    try {
      res.json(engine.list());
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      res.status(500).json({ 
        ok: false,
        error: { code: "internal_error", message: err.message } 
      });
    }
  });

  r.post("/invoke", validateBody(ToolInvokeSchema), async (req, res) => {
    try {
      const validatedBody = (req as any).validatedBody;
      const { toolId, args, permissions } = validatedBody;

      // Extract caller info from request (in production, this would come from auth middleware)
      const caller = {
        id: (req as any).user?.id || "api-caller",
        permissions: permissions || (req as any).user?.permissions || [],
      };

      const result = await engine.invoke(toolId, args, caller);
      
      // Return appropriate status code based on result
      if (!result.ok && result.error?.code === "insufficient_permissions") {
        return res.status(403).json(result);
      }
      if (!result.ok && result.error?.code === "tool_not_found") {
        return res.status(404).json(result);
      }

      res.json(result);
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      if (error instanceof ValidationError) {
        return res.status(400).json({ 
          ok: false,
          error: { code: "validation_error", message: err.message, details: (error as any).details } 
        });
      }
      res.status(500).json({ 
        ok: false,
        error: { code: "internal_error", message: err.message || "Internal server error" } 
      });
    }
  });

  return r;
}

