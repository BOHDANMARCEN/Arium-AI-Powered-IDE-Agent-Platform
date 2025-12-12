/**
 * Logger Transports
 * Pino transport configurations for different output targets
 */

import pino from "pino";
import { FileTransportConfig } from "./config";

/**
 * Create file transport configuration
 */
export function createFileTransport(config: FileTransportConfig): pino.TransportTargetOptions {
  return {
    target: "pino/file",
    options: {
      destination: config.path,
      mkdir: true,
      sync: false, // Async logging for better performance
    },
    level: "info", // File transport level
  };
}

/**
 * Create rotating file transport (requires pino-rotating-file-stream)
 */
export function createRotatingFileTransport(config: FileTransportConfig): pino.TransportTargetOptions {
  return {
    target: "pino-rotating-file-stream",
    options: {
      path: config.path,
      size: config.maxSize || "10m",
      maxFiles: config.maxFiles || 5,
      sync: false,
    },
    level: "info",
  };
}

/**
 * Create HTTP transport for remote logging
 */
export function createHttpTransport(url: string, headers?: Record<string, string>): pino.TransportTargetOptions {
  return {
    target: "@logtail/pino",
    options: {
      endpoint: url,
      headers,
    },
    level: "info",
  };
}

/**
 * Create Elasticsearch transport
 */
export function createElasticsearchTransport(config: {
  node: string;
  index: string;
  auth?: { username: string; password: string };
}): pino.TransportTargetOptions {
  return {
    target: "pino-elasticsearch",
    options: {
      node: config.node,
      index: config.index,
      auth: config.auth,
      sync: false,
    },
    level: "info",
  };
}
