import { Router } from "express";

export function toolsRoutes(engine: any) {
  const r = Router();

  r.get("/list", (req, res) => {
    res.json(engine.list());
  });

  r.post("/invoke", async (req, res) => {
    const { toolId, args } = req.body;
    const result = await engine.invoke(toolId, args);
    res.json(result);
  });

  return r;
}

