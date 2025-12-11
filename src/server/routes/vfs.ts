import { Router } from "express";

export function vfsRoutes(vfs: any) {
  const r = Router();

  r.get("/list", (req, res) => {
    res.json(vfs.listFiles());
  });

  r.get("/read", (req, res) => {
    const path = req.query.path as string;
    const content = vfs.read(path);
    if (content === null) return res.status(404).json({ error: "not found" });
    res.json({ path, content });
  });

  r.post("/write", (req, res) => {
    const { path, content } = req.body;
    const ver = vfs.write(path, content, "api");
    res.json({ ok: true, version: ver.id });
  });

  return r;
}

