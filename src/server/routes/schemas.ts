/**
 * Zod validation schemas for API routes
 */

import { z } from "zod";

// Path validation - relative paths only, no traversal
export const PathSchema = z
  .string()
  .min(1)
  .max(500)
  .refine(
    (val) => !val.includes(".."),
    "Path traversal sequences not allowed"
  )
  .refine(
    (val) => !val.startsWith("/") && !val.startsWith("\\"),
    "Absolute paths not allowed"
  )
  .refine(
    (val) => !val.match(/%2e|%2f|%5c/i),
    "Encoded traversal sequences not allowed"
  );

// Agent run request
export const AgentRunSchema = z.object({
  input: z.string().min(1).max(10000),
});

// VFS read request
export const VFSReadSchema = z.object({
  path: PathSchema,
});

// VFS write request
export const VFSWriteSchema = z.object({
  path: PathSchema,
  content: z.string().max(10 * 1024 * 1024), // 10MB max
});

// Tool invoke request
export const ToolInvokeSchema = z.object({
  toolId: z.string().min(1).max(100),
  args: z.record(z.any()),
  permissions: z.array(z.string()).optional(),
});

