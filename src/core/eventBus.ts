/**
 * Minimal typed Event Bus with append-only history
 * - emits events in-process (sync)
 * - writes history entries in-memory (can be persisted to disk easily)
 */

import { ulid } from "ulid";

export type EventType =
  | "PromptEvent"
  | "ModelResponseEvent"
  | "ToolInvocationEvent"
  | "ToolResultEvent"
  | "ToolErrorEvent"
  | "ToolExecutionEvent"
  | "VFSChangeEvent"
  | "AgentStartEvent"
  | "AgentStepEvent"
  | "AgentFinishEvent"
  | "SecurityEvent"
  | "ModelErrorEvent";

export interface EventEnvelope<T = any> {
  id: string;
  type: EventType;
  timestamp: number;
  payload: T;
  meta?: Record<string, any>;
}

type Listener = (evt: EventEnvelope) => void;

export interface EventBusConfig {
  maxHistorySize?: number; // Maximum number of events in memory
  historyRetentionPolicy?: "truncate" | "circular"; // How to handle overflow
}

export class EventBus {
  private listeners: Map<EventType | "any", Set<Listener>> = new Map();
  public history: EventEnvelope[] = [];
  private config: Required<EventBusConfig>;

  constructor(config: EventBusConfig = {}) {
    this.config = {
      maxHistorySize: config.maxHistorySize ?? 10000,
      historyRetentionPolicy: config.historyRetentionPolicy ?? "truncate",
    };
  }

  on(type: EventType | "any", listener: Listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(listener);
  }

  off(type: EventType | "any", listener: Listener) {
    this.listeners.get(type)?.delete(listener);
  }

  emit<T = any>(type: EventType, payload: T, meta?: Record<string, any>) {
    const envelope: EventEnvelope<T> = {
      id: ulid(),
      type,
      timestamp: Date.now(),
      payload,
      meta,
    };

    // Append to history
    this.history.push(envelope);

    // Enforce history limits
    if (this.history.length > this.config.maxHistorySize) {
      if (this.config.historyRetentionPolicy === "truncate") {
        const excess = this.history.length - this.config.maxHistorySize;
        this.history.splice(0, excess);
      } else if (this.config.historyRetentionPolicy === "circular") {
        this.history.shift();
      }
    }

    // Notify typed listeners
    const typed = this.listeners.get(type);
    if (typed) {
      for (const l of typed) {
        try {
          l(envelope);
        } catch (e) {
          // Emit error event instead of silently ignoring
          console.error(`[EventBus] Listener error for ${type}:`, e);
          try {
            this.emit("ModelErrorEvent", {
              type,
              error: (e as Error).message,
              listener: l.name || "anonymous",
            });
          } catch {
            // If emitting error event fails, just log
          }
        }
      }
    }

    // Notify 'any' listeners
    const any = this.listeners.get("any");
    if (any) {
      for (const l of any) {
        try {
          l(envelope);
        } catch (e) {
          console.error(`[EventBus] Listener error (any):`, e);
        }
      }
    }

    return envelope;
  }

  /**
   * Get history with optional filtering
   */
  getHistory(options?: { since?: number; limit?: number; type?: EventType }): EventEnvelope[] {
    let filtered = this.history;

    if (options?.since) {
      filtered = filtered.filter((e) => e.timestamp >= options.since!);
    }

    if (options?.type) {
      filtered = filtered.filter((e) => e.type === options.type);
    }

    if (options?.limit) {
      filtered = filtered.slice(-options.limit);
    }

    return filtered;
  }
}

