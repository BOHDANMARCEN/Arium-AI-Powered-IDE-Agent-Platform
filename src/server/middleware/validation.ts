/**
 * Reusable Zod validation middleware for Express routes
 * 
 * Author: Bogdan Marcen & ChatGPT 5.1
 */

import { Request, Response, NextFunction } from "express";
import { ZodSchema, ZodError, ZodObject } from "zod";
import { ValidationError } from "../../core/errors";

export interface ValidationResult<T> {
  success: true;
  data: T;
}

export interface ValidationFailure {
  success: false;
  error: ZodError;
}

/**
 * Create Express middleware that validates request body using Zod schema
 * Rejects extra fields using .strict()
 * Returns standardized error format
 */
export function validateBody<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      // Use strict() to reject extra fields (only for ZodObject)
      const strictSchema =
        schema instanceof ZodObject ? schema.strict() : schema;
      const result = strictSchema.safeParse(req.body);

      if (!result.success) {
        // Return standardized validation error
        return res.status(400).json({
          ok: false,
          error: {
            code: "validation_error",
            message: "Request validation failed",
            details: result.error.errors.map((err: ZodError["errors"][0]) => ({
              path: err.path.join("."),
              message: err.message,
              code: err.code,
            })),
          },
        });
      }

      // Attach validated data to request
      (req as any).validatedBody = result.data;
      next();
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      return res.status(500).json({
        ok: false,
        error: {
          code: "validation_error",
          message: `Validation middleware error: ${err.message}`,
        },
      });
    }
  };
}

/**
 * Create Express middleware that validates query parameters using Zod schema
 */
export function validateQuery<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const strictSchema =
        schema instanceof ZodObject ? schema.strict() : schema;
      const result = strictSchema.safeParse(req.query);

      if (!result.success) {
        return res.status(400).json({
          ok: false,
          error: {
            code: "validation_error",
            message: "Query validation failed",
            details: result.error.errors.map((err: ZodError["errors"][0]) => ({
              path: err.path.join("."),
              message: err.message,
              code: err.code,
            })),
          },
        });
      }

      (req as any).validatedQuery = result.data;
      next();
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      return res.status(500).json({
        ok: false,
        error: {
          code: "validation_error",
          message: `Query validation middleware error: ${err.message}`,
        },
      });
    }
  };
}

/**
 * Create Express middleware that validates path parameters using Zod schema
 */
export function validateParams<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const strictSchema =
        schema instanceof ZodObject ? schema.strict() : schema;
      const result = strictSchema.safeParse(req.params);

      if (!result.success) {
        return res.status(400).json({
          ok: false,
          error: {
            code: "validation_error",
            message: "Path parameter validation failed",
            details: result.error.errors.map((err: ZodError["errors"][0]) => ({
              path: err.path.join("."),
              message: err.message,
              code: err.code,
            })),
          },
        });
      }

      (req as any).validatedParams = result.data;
      next();
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      return res.status(500).json({
        ok: false,
        error: {
          code: "validation_error",
          message: `Params validation middleware error: ${err.message}`,
        },
      });
    }
  };
}

