import { Router, Request, Response } from "express";
import { AgentRunSchema } from "./schemas";
import { validateBody } from "../middleware/validation";
import { ValidationError } from "../../core/errors";

export function agentRoutes(agent: any) {
  const r = Router();

  // run agent task - uses validation middleware
  r.post("/run", validateBody(AgentRunSchema), async (req: Request, res: Response) => {
    try {
      // Get validated data from middleware
      const validatedBody = (req as ValidatedRequest).validatedBody;
      if (!validatedBody) {
        return res.status(400).json({
          ok: false,
          error: { code: "validation_error", message: "Missing validated body" },
        });
      }
      const { input } = validatedBody;

      const result = await agent.run(input);
      res.json(result);
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      if (error instanceof ValidationError) {
        return res.status(400).json({ 
          ok: false,
          error: { 
            code: "validation_error",
            message: err.message, 
            details: error instanceof ValidationError ? error.details : undefined 
          } 
        });
      }
      res.status(500).json({ 
        ok: false,
        error: { 
          code: "internal_error",
          message: err.message || "Internal server error" 
        } 
      });
    }
  });

  return r;
}

