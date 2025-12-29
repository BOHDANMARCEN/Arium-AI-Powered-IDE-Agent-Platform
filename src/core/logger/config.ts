/**
 * Logger Configuration
 * Defines configuration schema and validation for Arium Logger v2
 */

export type LogLevel = "fatal" | "error" | "warn" | "info" | "debug" | "trace";
export type LogFormat = "json" | "pretty";

export interface FileTransportConfig {
  enabled: boolean;
  path: string;
  maxSize?: string; // e.g., "10m"
  maxFiles?: number;
}

export interface LoggerConfig {
  level: LogLevel;
  format: LogFormat;
  file?: FileTransportConfig;
  source?: string;
}

/**
 * Default logger configuration
 */
const DEFAULT_CONFIG: LoggerConfig = {
  level: "info",
  format: "pretty",
  file: {
    enabled: false,
    path: "./logs/arium.log",
    maxSize: "10m",
    maxFiles: 5,
  },
};

/**
 * Create logger configuration with defaults
 */
export function createLoggerConfig(config: Partial<LoggerConfig> = {}): LoggerConfig {
  return {
    ...DEFAULT_CONFIG,
    ...config,
    file: config.file ? { ...DEFAULT_CONFIG.file, ...config.file } : DEFAULT_CONFIG.file,
  };
}

/**
 * Validate log level
 */
export function isValidLogLevel(level: string): level is LogLevel {
  return ["fatal", "error", "warn", "info", "debug", "trace"].includes(level);
}

/**
 * Parse log level from environment
 */
export function parseLogLevel(level: string | undefined): LogLevel {
  if (!level) return DEFAULT_CONFIG.level;
  if (isValidLogLevel(level)) return level;
  console.warn(`Invalid log level "${level}", using default "${DEFAULT_CONFIG.level}"`);
  return DEFAULT_CONFIG.level;
}

/**
 * Parse log format from environment
 */
export function parseLogFormat(format: string | undefined): LogFormat {
  if (!format) return DEFAULT_CONFIG.format;
  if (format === "json" || format === "pretty") return format;
  console.warn(`Invalid log format "${format}", using default "${DEFAULT_CONFIG.format}"`);
  return DEFAULT_CONFIG.format;
}
