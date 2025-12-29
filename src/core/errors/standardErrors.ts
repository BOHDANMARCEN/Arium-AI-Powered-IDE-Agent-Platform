/**
 * Standardized error classes for Arium
 * 
 * Author: Bogdan Marcen & ChatGPT 5.1
 */

export class ValidationError extends Error {
  constructor(
    message: string,
    public readonly details?: Record<string, unknown>,
    public readonly code: string = "validation_error"
  ) {
    super(message);
    this.name = "ValidationError";
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

export class PermissionError extends Error {
  constructor(
    message: string,
    public readonly missingPermissions?: string[],
    public readonly code: string = "permission_error"
  ) {
    super(message);
    this.name = "PermissionError";
    Object.setPrototypeOf(this, PermissionError.prototype);
  }
}

export class TimeoutError extends Error {
  constructor(
    message: string,
    public readonly timeoutMs?: number,
    public readonly code: string = "timeout_error"
  ) {
    super(message);
    this.name = "TimeoutError";
    Object.setPrototypeOf(this, TimeoutError.prototype);
  }
}

export class ToolExecutionError extends Error {
  constructor(
    message: string,
    public readonly code: string = "tool_execution_error"
  ) {
    super(message);
    this.name = "ToolExecutionError";
    Object.setPrototypeOf(this, ToolExecutionError.prototype);
  }
}

export class ModelError extends Error {
  constructor(
    message: string,
    public readonly modelName?: string,
    public readonly originalError?: Error,
    public readonly code: string = "model_error"
  ) {
    super(message);
    this.name = "ModelError";
    Object.setPrototypeOf(this, ModelError.prototype);
  }
}

export class RateLimitError extends Error {
  constructor(
    message: string,
    public readonly resetTime?: number,
    public readonly code: string = "rate_limit_error"
  ) {
    super(message);
    this.name = "RateLimitError";
    Object.setPrototypeOf(this, RateLimitError.prototype);
  }
}

export class ResourceError extends Error {
  constructor(
    message: string,
    public readonly resourceType?: string,
    public readonly code: string = "resource_error"
  ) {
    super(message);
    this.name = "ResourceError";
    Object.setPrototypeOf(this, ResourceError.prototype);
  }
}

