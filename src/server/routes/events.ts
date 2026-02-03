import { Router } from "express";

export function eventRoutes(eventBus: any) {
  const r = Router();

  r.get("/history", (req, res) => {
    res.json(eventBus.history);
  });

  return r;
}

