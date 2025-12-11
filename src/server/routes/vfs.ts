import { Router, Request, Response } from "express";
import { PathSchema, VFSReadSchema, VFSWriteSchema } from "./schemas";
import { validateBody, validateQuery } from "../middleware/validation";
import { ValidationError } from "../../core/errors";
import { z } from "zod";

export function vfsRoutes(vfs: any) {
  const r = Router();

  r.get("/list", (req, res) => {
    try {
      res.json(vfs.listFiles());
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  r.get("/read", validateQuery(z.object({ path: PathSchema }).strict()), (req, res) => {
    try {
      const validatedQuery = (req as any).validatedQuery;
      const { path: pathStr } = validatedQuery;
      const content = vfs.read(pathStr);
      if (content === null) {
        return res.status(404).json({ 
          ok: false,
          error: { code: "not_found", message: "File not found", path: pathStr } 
        });
      }
      res.json({ ok: true, path: pathStr, content });
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
        error: { code: "internal_error", message: err.message } 
      });
    }
  });

  r.post("/write", validateBody(VFSWriteSchema), async (req, res) => {
    try {
      const validatedBody = (req as any).validatedBody;
      const { path: pathStr, content } = validatedBody;
      const ver = vfs.write(pathStr, content, "api");
      res.json({ ok: true, version: ver.id, path: pathStr });
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      if (error instanceof ValidationError) {
        return res.status(400).json({ 
          ok: false,
          error: { code: "validation_error", message: err.message, details: (error as any).details } 
        });
      }
      // Handle path traversal and file size errors
      if (err.message?.includes("Path traversal") || err.message?.includes("too large")) {
        return res.status(403).json({ 
          ok: false,
          error: { code: "forbidden", message: err.message } 
        });
      }
      res.status(500).json({ 
        ok: false,
        error: { code: "internal_error", message: err.message || "Internal server error" } 
      });
    }
  });

  r.delete("/delete", validateQuery(z.object({ path: PathSchema }).strict()), (req, res) => {
    try {
      const validatedQuery = (req as any).validatedQuery;
      const { path: pathStr } = validatedQuery;
      const result = vfs.delete(pathStr, "api");
      if (!result.ok) {
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
        error: { code: "internal_error", message: err.message } 
      });
    }
  });

  return r;
}

