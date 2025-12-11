import { Router } from "express";

export function agentRoutes(agent: any) {
  const r = Router();

  // run agent task
  r.post("/run", async (req, res) => {
    const { input } = req.body;
    if (!input) return res.status(400).json({ error: "Missing input" });

    const result = await agent.run(input);
    res.json(result);
  });

  return r;
}

