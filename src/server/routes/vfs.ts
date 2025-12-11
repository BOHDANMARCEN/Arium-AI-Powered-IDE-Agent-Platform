import { Router, Request, Response } from "express";
import { PathSchema, VFSReadSchema, VFSWriteSchema } from "./schemas";
import { ValidationError } from "../../core/errors";

export function vfsRoutes(vfs: any) {
  const r = Router();

  r.get("/list", (req, res) => {
    try {
      res.json(vfs.listFiles());
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  r.get("/read", (req, res) => {
    try {
      // Validate query parameter
      const validation = VFSReadSchema.safeParse({ path: req.query.path });
      if (!validation.success) {
        return res.status(400).json({
          error: "Invalid input",
          details: validation.error.errors,
        });
      }

      const { path: pathStr } = validation.data;
      const content = vfs.read(pathStr);
      if (content === null) {
        return res.status(404).json({ error: "File not found", path: pathStr });
      }
      res.json({ path: pathStr, content });
    } catch (error: any) {
      if (error instanceof ValidationError) {
        return res.status(400).json({ error: error.message, details: error.details });
      }
      res.status(500).json({ error: error.message });
    }
  });

  r.post("/write", async (req, res) => {
    try {
      // Validate request body
      const validation = VFSWriteSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({
          error: "Invalid input",
          details: validation.error.errors,
        });
      }

      const { path: pathStr, content } = validation.data;
      const ver = vfs.write(pathStr, content, "api");
      res.json({ ok: true, version: ver.id, path: pathStr });
    } catch (error: any) {
      if (error instanceof ValidationError) {
        return res.status(400).json({ error: error.message, details: error.details });
      }
      // Handle path traversal and file size errors
      if (error.message?.includes("Path traversal") || error.message?.includes("too large")) {
        return res.status(403).json({ error: error.message });
      }
      res.status(500).json({ error: error.message || "Internal server error" });
    }
  });

  r.delete("/delete", (req, res) => {
    try {
      const validation = VFSReadSchema.safeParse({ path: req.query.path });
      if (!validation.success) {
        return res.status(400).json({
          error: "Invalid input",
          details: validation.error.errors,
        });
      }

      const { path: pathStr } = validation.data;
      const result = vfs.delete(pathStr, "api");
      if (!result.ok) {
        return res.status(404).json(result);
      }
      res.json(result);
    } catch (error: any) {
      if (error instanceof ValidationError) {
        return res.status(400).json({ error: error.message, details: error.details });
      }
      res.status(500).json({ error: error.message });
    }
  });

  return r;
}

