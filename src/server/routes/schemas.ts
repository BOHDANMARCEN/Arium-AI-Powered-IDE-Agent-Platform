/**
 * Zod validation schemas for API routes
 */

import { z } from "zod";

// Path validation - relative paths only, no traversal
// Maximum 1024 characters as per Phase 1.1 requirements
export const PathSchema = z
  .string()
  .min(1)
  .max(1024, "Path must not exceed 1024 characters")
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
  )
  .refine(
    (val) => !val.includes("\0"),
    "Null bytes not allowed in paths"
  );

// Agent run request - strict validation, no extra fields
export const AgentRunSchema = z
  .object({
    input: z.string().min(1).max(10000),
  })
  .strict();

// VFS read request - strict validation
export const VFSReadSchema = z
  .object({
    path: PathSchema,
  })
  .strict();

// VFS write request - strict validation
export const VFSWriteSchema = z
  .object({
    path: PathSchema,
    content: z.string().max(10 * 1024 * 1024), // 10MB max
    encoding: z.enum(["utf8", "base64"]).optional(),
  })
  .strict();

// Tool invoke request - strict validation
export const ToolInvokeSchema = z
  .object({
    toolId: z.string().min(1).max(100),
    args: z.record(z.unknown()),
    permissions: z.array(z.string()).optional(),
  })
  .strict();

