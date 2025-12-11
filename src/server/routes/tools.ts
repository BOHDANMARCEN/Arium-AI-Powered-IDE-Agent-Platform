import { Router, Request, Response } from "express";
import { ToolInvokeSchema } from "./schemas";
import { ValidationError } from "../../core/errors";

export function toolsRoutes(engine: any) {
  const r = Router();

  r.get("/list", (req, res) => {
    try {
      res.json(engine.list());
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  r.post("/invoke", async (req, res) => {
    try {
      // Validate request body
      const validation = ToolInvokeSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({
          error: "Invalid input",
          details: validation.error.errors,
        });
      }

      const { toolId, args, permissions } = validation.data;

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
    } catch (error: any) {
      if (error instanceof ValidationError) {
        return res.status(400).json({ error: error.message, details: error.details });
      }
      res.status(500).json({ error: error.message || "Internal server error" });
    }
  });

  return r;
}

