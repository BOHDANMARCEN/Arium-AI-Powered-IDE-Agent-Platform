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

export class EventBus {
  private listeners: Map<EventType | "any", Set<Listener>> = new Map();
  public history: EventEnvelope[] = [];

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
    // append-only history
    this.history.push(envelope);

    // notify typed listeners
    const typed = this.listeners.get(type);
    if (typed) for (const l of typed) try { l(envelope); } catch (e) { /* listener errors shouldn't crash bus */ }

    // notify 'any' listeners
    const any = this.listeners.get("any");
    if (any) for (const l of any) try { l(envelope); } catch (e) { /* ignore */ }

    return envelope;
  }
}

