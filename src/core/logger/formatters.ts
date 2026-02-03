/**
 * Logger Formatters
 * Custom Pino formatters for structured logging
 */

import { LoggerConfig } from "./config";

/**
 * Create Pino formatters based on configuration
 */
export function createFormatter(config: LoggerConfig): any {
  return {
    level: (label: string, number: number) => {
      return { level: label };
    },

    log: (obj: any) => {
      // Add source information if configured
      if (config.source) {
        obj.source = config.source;
      }

      // Add timestamp if not already present
      if (!obj.time) {
        obj.time = Date.now();
      }

      // Add correlation ID for request tracing if not present
      if (!obj.correlationId && obj.requestId) {
        obj.correlationId = obj.requestId;
      }

      return obj;
    },
  };
}

/**
 * Format log level for display
 */
export function formatLogLevel(level: string): string {
  const levelMap: Record<string, string> = {
    fatal: "FATAL",
    error: "ERROR",
    warn: "WARN",
    info: "INFO",
    debug: "DEBUG",
    trace: "TRACE",
  };

  return levelMap[level] || level.toUpperCase();
}

/**
 * Format duration for display
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  } else if (ms < 60000) {
    return `${(ms / 1000).toFixed(2)}s`;
  } else {
    const minutes = Math.floor(ms / 60000);
    const seconds = ((ms % 60000) / 1000).toFixed(2);
    return `${minutes}m ${seconds}s`;
  }
}

/**
 * Format bytes for display
 */
export function formatBytes(bytes: number): string {
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex++;
  }

  return `${value.toFixed(2)}${units[unitIndex]}`;
}

/**
 * Sanitize object for logging (remove circular references, etc.)
 */
export function sanitizeForLogging(obj: any, maxDepth = 5, currentDepth = 0): any {
  if (currentDepth >= maxDepth) {
    return "[Max Depth Reached]";
  }

  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === "function") {
    return "[Function]";
  }

  if (typeof obj === "symbol") {
    return obj.toString();
  }

  if (typeof obj !== "object") {
    return obj;
  }

  // Handle arrays
  if (Array.isArray(obj)) {
    if (obj.length > 100) {
      return `[Array(${obj.length})]`;
    }
    return obj.map(item => sanitizeForLogging(item, maxDepth, currentDepth + 1));
  }

  // Handle objects
  const sanitized: any = {};
  const keys = Object.keys(obj);

  // Limit number of keys for large objects
  const maxKeys = 50;
  const keysToProcess = keys.length > maxKeys ? keys.slice(0, maxKeys) : keys;

  for (const key of keysToProcess) {
    try {
      sanitized[key] = sanitizeForLogging(obj[key], maxDepth, currentDepth + 1);
    } catch (error) {
      sanitized[key] = "[Error serializing]";
    }
  }

  if (keys.length > maxKeys) {
    sanitized["..."] = `${keys.length - maxKeys} more keys`;
  }

  return sanitized;
}
