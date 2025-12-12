/**
 * Arium Logger v2 - Pino-based logging system
 *
 * Features:
 * - Structured JSON logging with Pino
 * - Multiple log levels and transports
 * - EventBus integration for real-time log streaming
 * - Configurable formatting (pretty print, JSON)
 * - Performance monitoring and request tracing
 *
 * Authors:
 * Bogdan Marcen — Founder & Lead Developer
 * ChatGPT 5.1 — AI Architect & Co-Developer
 */

import pino from "pino";
import pinoPretty from "pino-pretty";
import { EventBus } from "../eventBus";
import { LoggerConfig, createLoggerConfig } from "./config";
import { createFileTransport } from "./transports";
import { createFormatter } from "./formatters";

export interface LoggerContext {
  userId?: string;
  sessionId?: string;
  requestId?: string;
  agentId?: string;
  toolId?: string;
  correlationId?: string;
  [key: string]: any;
}

/**
 * Enhanced Pino logger with EventBus integration
 */
export class AriumLogger {
  private pinoLogger: pino.Logger;
  private eventBus: EventBus;
  private config: LoggerConfig;

  constructor(eventBus: EventBus, config: Partial<LoggerConfig> = {}) {
    this.eventBus = eventBus;
    this.config = createLoggerConfig(config);

    // Create transports array
    const transports: pino.TransportTargetOptions[] = [];

    // Add pretty print transport for console
    if (this.config.format === "pretty") {
      transports.push({
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "SYS:standard",
          ignore: "pid,hostname",
        },
        level: this.config.level,
      });
    }

    // Add JSON transport for console in production
    if (this.config.format === "json") {
      transports.push({
        target: "pino/file",
        options: {},
        level: this.config.level,
      });
    }

    // Add file transport if configured
    if (this.config.file?.enabled) {
      transports.push({
        target: "pino/file",
        options: {
          destination: this.config.file.path,
          mkdir: true,
        },
        level: "info",
      });
    }

    // Create pino logger with transports
    this.pinoLogger = pino(
      {
        level: this.config.level,
        formatters: createFormatter(this.config),
        serializers: {
          error: pino.stdSerializers.err,
          req: pino.stdSerializers.req,
          res: pino.stdSerializers.res,
        },
      },
      pino.transport({
        targets: transports,
      })
    );

    // Setup EventBus integration
    this.setupEventBusIntegration();
  }

  /**
   * Create child logger with context
   */
  child(context: LoggerContext): AriumLogger {
    const childLogger = new AriumLogger(this.eventBus, this.config);
    childLogger.pinoLogger = this.pinoLogger.child(context);
    return childLogger;
  }

  /**
   * Log methods with structured context
   */
  debug(message: string, context?: LoggerContext): void {
    this.pinoLogger.debug(context || {}, message);
  }

  info(message: string, context?: LoggerContext): void {
    this.pinoLogger.info(context || {}, message);
  }

  warn(message: string, context?: LoggerContext): void {
    this.pinoLogger.warn(context || {}, message);
  }

  error(message: string | Error, context?: LoggerContext): void {
    const error = message instanceof Error ? message : new Error(message);
    this.pinoLogger.error({ ...context, err: error }, error.message);
  }

  fatal(message: string | Error, context?: LoggerContext): void {
    const error = message instanceof Error ? message : new Error(message);
    this.pinoLogger.fatal({ ...context, err: error }, error.message);
  }

  /**
   * Performance logging
   */
  startTimer(name: string, context?: LoggerContext): () => void {
    const start = Date.now();
    return () => {
      const duration = Date.now() - start;
      this.info(`Timer: ${name}`, { ...context, duration, timer: name });
    };
  }

  /**
   * Request tracing
   */
  traceRequest(method: string, url: string, statusCode: number, duration: number, context?: LoggerContext): void {
    const level = statusCode >= 400 ? "warn" : "info";
    this.pinoLogger[level](
      {
        ...context,
        method,
        url,
        statusCode,
        duration,
        type: "request",
      },
      `${method} ${url} ${statusCode} (${duration}ms)`
    );
  }

  /**
   * Agent execution tracing
   */
  traceAgentExecution(agentId: string, task: string, steps: number, duration: number, success: boolean, context?: LoggerContext): void {
    this.info("Agent execution completed", {
      ...context,
      agentId,
      task,
      steps,
      duration,
      success,
      type: "agent_execution",
    });
  }

  /**
   * Tool execution tracing
   */
  traceToolExecution(toolId: string, args: any, duration: number, success: boolean, error?: string, context?: LoggerContext): void {
    const level = success ? "debug" : "warn";
    this.pinoLogger[level](
      {
        ...context,
        toolId,
        args: this.sanitizeArgs(args),
        duration,
        success,
        error,
        type: "tool_execution",
      },
      `Tool ${toolId} ${success ? "succeeded" : "failed"} (${duration}ms)`
    );
  }

  /**
   * Model interaction tracing
   */
  traceModelCall(modelId: string, prompt: string, response: any, duration: number, tokens?: { prompt: number; completion: number }, context?: LoggerContext): void {
    this.debug("Model interaction", {
      ...context,
      modelId,
      promptLength: prompt.length,
      responseLength: typeof response === "string" ? response.length : JSON.stringify(response).length,
      duration,
      tokens,
      type: "model_call",
    });
  }

  /**
   * Security event logging
   */
  securityEvent(event: string, details: any, context?: LoggerContext): void {
    this.warn(`Security event: ${event}`, {
      ...context,
      event,
      details: this.sanitizeSecurityDetails(details),
      type: "security",
    });
  }

  /**
   * Flush all pending logs
   */
  async flush(): Promise<void> {
    await this.pinoLogger.flush();
  }

  /**
   * Setup EventBus integration for real-time log streaming
   */
  private setupEventBusIntegration(): void {
    // Listen to relevant events and log them
    const eventMappings = [
      { event: "AgentStartEvent", level: "info" as const, message: "Agent started" },
      { event: "AgentStepEvent", level: "debug" as const, message: "Agent step executed" },
      { event: "AgentFinishEvent", level: "info" as const, message: "Agent finished" },
      { event: "ToolInvocationEvent", level: "debug" as const, message: "Tool invoked" },
      { event: "ToolResultEvent", level: "debug" as const, message: "Tool completed" },
      { event: "ToolErrorEvent", level: "warn" as const, message: "Tool error" },
      { event: "ModelResponseEvent", level: "debug" as const, message: "Model responded" },
      { event: "ModelErrorEvent", level: "warn" as const, message: "Model error" },
      { event: "SecurityEvent", level: "warn" as const, message: "Security event" },
      { event: "VFSOperationEvent", level: "debug" as const, message: "VFS operation" },
    ];

    eventMappings.forEach(({ event, level, message }) => {
      this.eventBus.on(event as any, (evt: any) => {
        this.pinoLogger[level](
          {
            event,
            payload: evt.payload,
            type: "eventbus",
            correlationId: evt.id,
          },
          message
        );
      });
    });
  }

  /**
   * Sanitize sensitive arguments for logging
   */
  private sanitizeArgs(args: any): any {
    if (!args || typeof args !== "object") return args;

    const sanitized = { ...args };
    const sensitiveKeys = ["password", "token", "key", "secret", "auth"];

    for (const key of Object.keys(sanitized)) {
      if (sensitiveKeys.some(sensitive => key.toLowerCase().includes(sensitive))) {
        sanitized[key] = "[REDACTED]";
      } else if (typeof sanitized[key] === "object") {
        sanitized[key] = this.sanitizeArgs(sanitized[key]);
      }
    }

    return sanitized;
  }

  /**
   * Sanitize security event details
   */
  private sanitizeSecurityDetails(details: any): any {
    // For security events, be extra careful with what we log
    if (!details || typeof details !== "object") return details;

    const sanitized = { ...details };
    // Redact everything except safe metadata
    const safeKeys = ["userId", "ip", "userAgent", "timestamp", "action"];

    for (const key of Object.keys(sanitized)) {
      if (!safeKeys.includes(key)) {
        sanitized[key] = "[REDACTED]";
      }
    }

    return sanitized;
  }
}

/**
 * Global logger instance
 */
let globalLogger: AriumLogger | null = null;

/**
 * Initialize global logger
 */
export function initializeLogger(eventBus: EventBus, config: Partial<LoggerConfig> = {}): AriumLogger {
  globalLogger = new AriumLogger(eventBus, config);
  return globalLogger;
}

/**
 * Get global logger instance
 */
export function getLogger(): AriumLogger {
  if (!globalLogger) {
    throw new Error("Logger not initialized. Call initializeLogger() first.");
  }
  return globalLogger;
}

/**
 * Create contextual logger
 */
export function createContextualLogger(context: LoggerContext): AriumLogger {
  return getLogger().child(context);
}

/**
 * Utility functions for common logging patterns
 */
export const logger = {
  debug: (message: string, context?: LoggerContext) => getLogger().debug(message, context),
  info: (message: string, context?: LoggerContext) => getLogger().info(message, context),
  warn: (message: string, context?: LoggerContext) => getLogger().warn(message, context),
  error: (message: string | Error, context?: LoggerContext) => getLogger().error(message, context),
  fatal: (message: string | Error, context?: LoggerContext) => getLogger().fatal(message, context),

  // Specialized loggers
  agent: (agentId: string) => createContextualLogger({ agentId }),
  tool: (toolId: string) => createContextualLogger({ toolId }),
  request: (requestId: string) => createContextualLogger({ requestId }),

  // Performance and tracing
  startTimer: (name: string, context?: LoggerContext) => getLogger().startTimer(name, context),
  traceRequest: (method: string, url: string, statusCode: number, duration: number, context?: LoggerContext) =>
    getLogger().traceRequest(method, url, statusCode, duration, context),
  traceAgentExecution: (agentId: string, task: string, steps: number, duration: number, success: boolean, context?: LoggerContext) =>
    getLogger().traceAgentExecution(agentId, task, steps, duration, success, context),
  traceToolExecution: (toolId: string, args: any, duration: number, success: boolean, error?: string, context?: LoggerContext) =>
    getLogger().traceToolExecution(toolId, args, duration, success, error, context),
  traceModelCall: (modelId: string, prompt: string, response: any, duration: number, tokens?: { prompt: number; completion: number }, context?: LoggerContext) =>
    getLogger().traceModelCall(modelId, prompt, response, duration, tokens, context),

  // Security
  securityEvent: (event: string, details: any, context?: LoggerContext) =>
    getLogger().securityEvent(event, details, context),
};
