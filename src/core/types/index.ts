/**
 * Core type definitions for Arium
 * Phase 3.1: Type System Improvements
 * 
 * Author: Bogdan Marcen & ChatGPT 5.1
 */

import { Permission } from "../agent/permissions";

/**
 * Tool interface - standardized tool definition
 */
export interface Tool {
  id: string;
  name: string;
  description?: string;
  runner: "builtin" | "js" | "py";
  schema?: Record<string, unknown>; // JSON Schema
  permissions?: Permission[];
}

/**
 * VFS Operation types
 */
export type VFSOperation = "read" | "write" | "delete" | "list" | "snapshot" | "diff";

export interface VFSOperationResult<T = unknown> {
  ok: boolean;
  data?: T;
  error?: {
    message: string;
    code?: string;
    path?: string;
  };
}

export interface VFSReadOperation {
  type: "read";
  path: string;
}

export interface VFSWriteOperation {
  type: "write";
  path: string;
  content: string;
  encoding?: "utf8" | "base64";
}

export interface VFSDeleteOperation {
  type: "delete";
  path: string;
}

export interface VFSListOperation {
  type: "list";
  path?: string;
}

export interface VFSSnapshotOperation {
  type: "snapshot";
  author?: string;
}

export interface VFSDiffOperation {
  type: "diff";
  versionA: string | null;
  versionB: string | null;
}

export type VFSOperationRequest =
  | VFSReadOperation
  | VFSWriteOperation
  | VFSDeleteOperation
  | VFSListOperation
  | VFSSnapshotOperation
  | VFSDiffOperation;

/**
 * AgentConfig interface - standardized agent configuration
 */
export interface AgentConfig {
  id: string;
  maxSteps?: number;
  model?: unknown; // ModelAdapter - imported separately to avoid circular deps
  temperature?: number;
  maxTokens?: number;
  maxContextSize?: number;
  contextSummarizationThreshold?: number;
  maxContextTokens?: number;
  maxConsecutiveFailures?: number;
  stepTimeoutMs?: number;
  globalTimeoutMs?: number;
  maxExecutionTimeMs?: number;
  maxIdenticalToolCalls?: number;
  permissions?: Permission[];
}

/**
 * Tool execution context
 */
export interface ToolExecutionContext {
  eventBus: unknown; // EventBus - imported separately
  caller?: ToolCaller;
}

/**
 * Tool execution result
 */
export interface ToolExecutionResult<T = unknown> {
  ok: boolean;
  data?: T;
  error?: {
    message: string;
    code?: string;
    type?: string;
    [key: string]: unknown;
  };
}

/**
 * Caller context for tool execution
 */
export interface ToolCaller {
  id: string;
  permissions: Permission[];
}
