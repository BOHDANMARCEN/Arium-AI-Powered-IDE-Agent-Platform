import { Router, Request, Response } from "express";
import { AgentRunSchema } from "./schemas";
import { ValidationError } from "../../core/errors";

export function agentRoutes(agent: any) {
  const r = Router();

  // run agent task
  r.post("/run", async (req, res) => {
    try {
      // Validate request body
      const validation = AgentRunSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({
          error: "Invalid input",
          details: validation.error.errors,
        });
      }

      const { input } = validation.data;

      const result = await agent.run(input);
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

