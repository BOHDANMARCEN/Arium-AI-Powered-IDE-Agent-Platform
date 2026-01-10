/**
 * Minimal typed Event Bus with append-only history
 * - emits events in-process (sync)
 * - writes history entries in-memory (can be persisted to disk easily)
 */

import { ulid } from "ulid";

export interface ContextSummarizedEvent {
  type: "context_summarized";
  payload: {
    summary: string;
    removedMessages: number;
  };
}

export type EventType =
  | "PromptEvent"
  | "ModelResponseEvent"
  | "ToolInvocationEvent"
  | "ToolResultEvent"
  | "ToolErrorEvent"
  | "ToolExecutionEvent"
  | "ToolExecutionMetrics"
  | "ModelExecutionMetrics"
  | "VFSChangeEvent"
  | "AgentStartEvent"
  | "AgentStepEvent"
  | "AgentFinishEvent"
  | "SecurityEvent"
  | "ModelErrorEvent"
  | "EventArchiveEvent"
  | "AgentEmergencyStopEvent"
  | "SandboxViolationEvent"
  | "ContextCompressionEvent"
  | "StopConditionTriggered"
  | "DebugMetricsEvent"
  | "context_summarized"
  | "ollama.ready";

export interface EventEnvelope<T = unknown> {
  id: string;
  type: EventType;
  timestamp: number;
  payload: T;
  meta?: Record<string, unknown>;
}

type Listener<T = unknown> = (evt: EventEnvelope<T>) => void;

export interface EventBusConfig {
  maxHistorySize?: number; // Maximum number of events in memory
  historyRetentionPolicy?: "truncate" | "circular"; // How to handle overflow
  archiveThreshold?: number; // Archive when history exceeds this (default: maxHistorySize * 0.8)
  archiveCallback?: (archived: EventEnvelope[]) => void | Promise<void>; // Callback for archived events
}

export class EventBus {
  private listeners: Map<EventType | "any", Set<Listener<unknown>>> = new Map();
  public history: EventEnvelope<unknown>[] = [];
  private archived: EventEnvelope<unknown>[] = []; // Archived events
  private isArchiving = false;
  private archiveThresholdConfigured: boolean;
  private config: Required<Omit<EventBusConfig, "archiveCallback">> & {
    archiveCallback?: (archived: EventEnvelope<unknown>[]) => void | Promise<void>;
  };

  constructor(config: EventBusConfig = {}) {
    const maxHistorySize = config.maxHistorySize ?? parseInt(process.env.EVENT_HISTORY_LIMIT || "10000", 10);
    this.archiveThresholdConfigured = config.archiveThreshold !== undefined;
    this.config = {
      maxHistorySize,
      historyRetentionPolicy: config.historyRetentionPolicy ?? "truncate",
      archiveThreshold: config.archiveThreshold ?? maxHistorySize,
      archiveCallback: config.archiveCallback,
    };
  }

  on<T = unknown>(type: EventType | "any", listener: Listener<T>) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(listener as Listener);
  }

  off<T = unknown>(type: EventType | "any", listener: Listener<T>) {
    this.listeners.get(type)?.delete(listener as Listener);
  }

  emit<T = unknown>(type: EventType, payload: T, meta?: Record<string, unknown>) {
    const envelope: EventEnvelope<T> = {
      id: ulid(),
      type,
      timestamp: Date.now(),
      payload,
      meta,
    };

    const isArchiveEvent = type === "EventArchiveEvent";

    if (!isArchiveEvent) {
      // Append to history
      this.history.push(envelope);

      // Automatic archival when threshold is reached
      if (
        this.archiveThresholdConfigured &&
        !this.isArchiving &&
        this.history.length > this.config.archiveThreshold
      ) {
        this.archiveOldEvents();
      }

      // Enforce history limits
      if (this.history.length > this.config.maxHistorySize) {
        if (this.config.historyRetentionPolicy === "truncate") {
          const excess = this.history.length - this.config.maxHistorySize;
          const removed = this.history.splice(0, excess);
          // Move removed events to archive
          this.archived.push(...removed);
        } else if (this.config.historyRetentionPolicy === "circular") {
          const removed = this.history.shift();
          if (removed) {
            this.archived.push(removed);
          }
        }
      }
    }

    const listenerEnvelope =
      type === "SecurityEvent" && typeof (payload as { type?: string })?.type === "string"
        ? ({ ...envelope, type: (payload as { type: string }).type } as EventEnvelope)
        : envelope;

    // Notify typed listeners
    const typed = this.listeners.get(type);
    if (typed) {
      for (const l of typed) {
        try {
          l(listenerEnvelope);
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
          l(listenerEnvelope);
        } catch (e) {
          console.error(`[EventBus] Listener error (any):`, e);
        }
      }
    }

    return envelope;
  }

  /**
   * Archive old events automatically
   */
  private archiveOldEvents(): void {
    const toArchive = Math.floor(this.history.length * 0.2); // Archive 20% of events
    if (toArchive === 0) return;

    const archived: EventEnvelope<unknown>[] = this.history.splice(0, toArchive);
    this.archived.push(...archived);

    // Emit archive event
    this.isArchiving = true;
    this.emit("EventArchiveEvent", {
      archivedCount: archived.length,
      totalArchived: this.archived.length,
      remainingInHistory: this.history.length,
    });
    this.isArchiving = false;

    // Call archive callback if provided
    if (this.config.archiveCallback) {
      try {
        const result = this.config.archiveCallback(archived);
        if (result instanceof Promise) {
          result.catch((err) => {
            console.error("[EventBus] Archive callback error:", err);
          });
        }
      } catch (err) {
        console.error("[EventBus] Archive callback error:", err);
      }
    }
  }

  /**
   * Get history with optional filtering
   */
  getHistory<T = unknown>(options?: { since?: number; limit?: number; type?: EventType }): EventEnvelope<T>[] {
    let filtered = this.history as EventEnvelope<T>[];

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

  /**
   * Get archived events
   */
  getArchived(): readonly EventEnvelope<unknown>[] {
    return [...this.archived];
  }

  /**
   * Get memory usage metrics
   */
  getMemoryMetrics(): {
    historySize: number;
    archivedSize: number;
    totalEvents: number;
    estimatedMemoryBytes: number;
  } {
    const historySize = this.history.length;
    const archivedSize = this.archived.length;
    const totalEvents = historySize + archivedSize;
    
    // Rough estimate: ~200 bytes per event envelope
    const estimatedMemoryBytes = totalEvents * 200;

    return {
      historySize,
      archivedSize,
      totalEvents,
      estimatedMemoryBytes,
    };
  }
}
