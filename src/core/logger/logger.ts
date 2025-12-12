/**
 * Arium Logger v2 - Pino-based Structured Logging
 * Professional logging with pretty dev output and JSON structured mode
 *
 * Author: Bogdan Marcen & ChatGPT 5.1
 */

import pino from "pino";
import { EventBus } from "../eventBus";
import { createDevTransport } from "./transports";
import { LoggerConfig, LogLevel, LogSource } from "./config";

export class Logger {
  private logger: pino.Logger;
  private config: LoggerConfig;
  private eventBus?: EventBus;

  constructor(config: LoggerConfig = {}, eventBus?: EventBus) {
    this.config = {
      level: config.level || "info",
      format: config.format || "pretty",
      source: config.source,
      ...config,
    };

    this.eventBus = eventBus;

    // Create Pino logger with appropriate transport
    this.logger = pino({
      level: this.config.level,
      formatters: {
        level: (label) => ({ level: label }),
        log: (obj) => {
          if (this.config.source) {
            obj.source = this.config.source;
          }
          return obj;
        },
      },
      serializers: {
        error: pino.stdSerializers.err,
        req: pino.stdSerializers.req,
        res: pino.stdSerializers.res,
      },
      ...(this.config.format === "pretty" ? createDevTransport() : {}),
    });

    // Bind methods for better performance
    this.trace = this.trace.bind(this);
    this.debug = this.debug.bind(this);
    this.info = this.info.bind(this);
    this.warn = this.warn.bind(this);
    this.error = this.error.bind(this);
    this.fatal = this.fatal.bind(this);
  }

  /**
   * Create a child logger with additional context
   */
  child(bindings: Record<string, any>): Logger {
    const childLogger = new Logger(this.config, this.eventBus);
    childLogger.logger = this.logger.child(bindings);
    return childLogger;
  }

  /**
   * Create a logger for a specific source (agent, tool, model)
   */
  static forSource(source: LogSource, config?: LoggerConfig, eventBus?: EventBus): Logger {
    return new Logger({ ...config, source }, eventBus);
  }

  /**
   * Update logger configuration
   */
  updateConfig(config: Partial<LoggerConfig>): void {
    this.config = { ...this.config, ...config };

    // Recreate logger with new config
    this.logger = pino({
      level: this.config.level,
      formatters: {
        level: (label) => ({ level: label }),
        log: (obj) => {
          if (this.config.source) {
            obj.source = this.config.source;
          }
          return obj;
        },
      },
      serializers: {
        error: pino.stdSerializers.err,
        req: pino.stdSerializers.req,
        res: pino.stdSerializers.res,
      },
      ...(this.config.format === "pretty" ? createDevTransport() : {}),
    });
  }

  // Logging methods
  trace(obj: any, msg?: string, ...args: any[]): void {
    this.emitEvent("trace", obj, msg, ...args);
    this.logger.trace(obj, msg, ...args);
  }

  debug(obj: any, msg?: string, ...args: any[]): void {
    this.emitEvent("debug", obj, msg, ...args);
    this.logger.debug(obj, msg, ...args);
  }

  info(obj: any, msg?: string, ...args: any[]): void {
    this.emitEvent("info", obj, msg, ...args);
    this.logger.info(obj, msg, ...args);
  }

  warn(obj: any, msg?: string, ...args: any[]): void {
    this.emitEvent("warn", obj, msg, ...args);
    this.logger.warn(obj, msg, ...args);
  }

  error(obj: any, msg?: string, ...args: any[]): void {
    this.emitEvent("error", obj, msg, ...args);
    this.logger.error(obj, msg, ...args);
  }

  fatal(obj: any, msg?: string, ...args: any[]): void {
    this.emitEvent("fatal", obj, msg, ...args);
    this.logger.fatal(obj, msg, ...args);
  }

  /**
   * Emit logging event to EventBus
   */
  private emitEvent(level: LogLevel, obj: any, msg?: string, ...args: any[]): void {
    if (!this.eventBus) return;

    try {
      this.eventBus.emit("DebugMetricsEvent", {
        type: "log",
        level,
        source: this.config.source,
        message: msg || (typeof obj === "string" ? obj : JSON.stringify(obj)),
        data: typeof obj === "object" ? obj : undefined,
        timestamp: Date.now(),
      });
    } catch (error) {
      // Don't let event emission errors break logging
      console.error("[Logger] Failed to emit log event:", error);
    }
  }

  /**
   * Check if level is enabled
   */
  isLevelEnabled(level: LogLevel): boolean {
    return this.logger.isLevelEnabled(level as pino.Level);
  }

  /**
   * Get current configuration
   */
  getConfig(): LoggerConfig {
    return { ...this.config };
  }
}
