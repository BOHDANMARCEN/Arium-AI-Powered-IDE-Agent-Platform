/**
 * Standard Tool Schema for Arium 0.2.0
 * Zod-based validation for all tools
 *
 * Author: Bogdan Marcen & ChatGPT 5.1
 */

import { z } from "zod";
import { Permission } from "../agent/permissions";

/**
 * Standard Tool Schema interface
 */
export interface ToolSchema {
  name: string;
  description: string;
  input: z.ZodSchema;
  output: z.ZodSchema;
  permissions: Permission[];
}

/**
 * Base tool schema with common fields
 */
export const BaseToolSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().min(1).max(500),
  permissions: z.array(
    z.union([
      z.literal("vfs.read"),
      z.literal("vfs.write"),
      z.literal("vfs.delete"),
      z.literal("net.fetch"),
      z.literal("process.execute"),
      z.literal("python.execute"),
      z.literal("js.execute"),
      z.literal("tool.run"),
      z.literal("model.call"),
    ])
  ),
});

/**
 * Tool schema validation
 */
export const ToolSchemaValidator = z.object({
  name: z.string().min(1).max(100),
  description: z.string().min(1).max(500),
  input: z.custom<z.ZodSchema>((val) => val instanceof z.ZodSchema, {
    message: "Input must be a Zod schema",
  }),
  output: z.custom<z.ZodSchema>((val) => val instanceof z.ZodSchema, {
    message: "Output must be a Zod schema",
  }),
  permissions: z.array(
    z.union([
      z.literal("vfs.read"),
      z.literal("vfs.write"),
      z.literal("vfs.delete"),
      z.literal("net.fetch"),
      z.literal("process.execute"),
      z.literal("python.execute"),
      z.literal("js.execute"),
      z.literal("tool.run"),
      z.literal("model.call"),
    ])
  ),
});

/**
 * Tool execution context schema
 */
export const ToolExecutionContextSchema = z.object({
  eventBus: z.any(), // EventBus type would go here
  caller: z
    .object({
      id: z.string(),
      permissions: z.array(
        z.union([
          z.literal("vfs.read"),
          z.literal("vfs.write"),
          z.literal("vfs.delete"),
          z.literal("net.fetch"),
          z.literal("process.execute"),
          z.literal("python.execute"),
          z.literal("js.execute"),
          z.literal("tool.run"),
          z.literal("model.call"),
        ])
      ),
    })
    .optional(),
});

/**
 * Tool execution result schema
 */
export const ToolExecutionResultSchema = z.union([
  z.object({
    ok: z.literal(true),
    data: z.unknown(),
  }),
  z.object({
    ok: z.literal(false),
    error: z.object({
      message: z.string(),
      code: z.string().optional(),
      details: z.record(z.unknown()).optional(),
    }),
  }),
]);

/**
 * Tool definition schema (extended)
 */
export const ToolDefSchema = BaseToolSchema.extend({
  id: z.string().min(1).max(100),
  runner: z.union([z.literal("builtin"), z.literal("js"), z.literal("py")]),
  schema: z.record(z.unknown()).optional(),
});

/**
 * Utility functions for tool schema validation
 */
export class ToolSchemaValidatorUtils {
  static validateToolSchema(schema: unknown): ToolSchema {
    const parsed = ToolSchemaValidator.parse(schema);
    return {
      name: parsed.name,
      description: parsed.description,
      input: parsed.input,
      output: parsed.output,
      permissions: parsed.permissions,
    };
  }

  static validateInputAgainstSchema(
    input: unknown,
    schema: z.ZodSchema
  ): unknown {
    return schema.parse(input);
  }

  static validateOutputAgainstSchema(
    output: unknown,
    schema: z.ZodSchema
  ): unknown {
    return schema.parse(output);
  }

  static createToolSchema<InputT, OutputT>(
    name: string,
    description: string,
    inputSchema: z.ZodSchema<InputT>,
    outputSchema: z.ZodSchema<OutputT>,
    permissions: Permission[] = []
  ): ToolSchema {
    return {
      name,
      description,
      input: inputSchema,
      output: outputSchema,
      permissions,
    };
  }
}