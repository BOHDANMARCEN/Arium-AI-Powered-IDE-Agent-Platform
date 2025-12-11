/**
 * Custom error types for Arium
 */

export class AriumError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode?: number,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "AriumError";
    Object.setPrototypeOf(this, AriumError.prototype);
  }
}

export class PathTraversalError extends AriumError {
  constructor(path: string) {
    super(
      `Path traversal detected: ${path}`,
      "PATH_TRAVERSAL",
      400,
      { path }
    );
    this.name = "PathTraversalError";
    Object.setPrototypeOf(this, PathTraversalError.prototype);
  }
}

export class PermissionDeniedError extends AriumError {
  constructor(toolId: string, missingPermissions: string[]) {
    super(
      `Permission denied for tool ${toolId}`,
      "PERMISSION_DENIED",
      403,
      { toolId, missingPermissions }
    );
    this.name = "PermissionDeniedError";
    Object.setPrototypeOf(this, PermissionDeniedError.prototype);
  }
}

export class ToolNotFoundError extends AriumError {
  constructor(toolId: string) {
    super(
      `Tool not found: ${toolId}`,
      "TOOL_NOT_FOUND",
      404,
      { toolId }
    );
    this.name = "ToolNotFoundError";
    Object.setPrototypeOf(this, ToolNotFoundError.prototype);
  }
}

export class ValidationError extends AriumError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(
      `Validation failed: ${message}`,
      "VALIDATION_ERROR",
      400,
      details
    );
    this.name = "ValidationError";
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

// Re-export standardized errors for convenience
export {
  ValidationError as StandardValidationError,
  PermissionError,
  TimeoutError,
  ModelError,
  RateLimitError,
  ResourceError,
} from "./errors/standardErrors";

export class ModelAdapterError extends AriumError {
  constructor(
    message: string,
    public provider: string,
    public originalError?: Error
  ) {
    super(
      `Model adapter error (${provider}): ${message}`,
      "MODEL_ADAPTER_ERROR",
      500,
      { provider, originalError: originalError?.message }
    );
    this.name = "ModelAdapterError";
    Object.setPrototypeOf(this, ModelAdapterError.prototype);
  }
}

export class AgentLoopError extends AriumError {
  constructor(message: string, public step: number) {
    super(
      `Agent loop error: ${message}`,
      "AGENT_LOOP_ERROR",
      500,
      { step }
    );
    this.name = "AgentLoopError";
    Object.setPrototypeOf(this, AgentLoopError.prototype);
  }
}

export class VFSError extends AriumError {
  constructor(message: string, public path?: string) {
    super(
      `VFS error: ${message}`,
      "VFS_ERROR",
      500,
      { path }
    );
    this.name = "VFSError";
    Object.setPrototypeOf(this, VFSError.prototype);
  }
}

