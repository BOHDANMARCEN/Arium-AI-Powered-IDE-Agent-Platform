/**
 * Persistent EventBus with disk storage
 * Appends events to workspace/<project>/history.log
 */

import * as fs from "fs/promises";
import * as path from "path";
import { EventBus, EventEnvelope, EventType } from "../eventBus";

export interface PersistentEventBusConfig {
  workspacePath: string;
  projectId: string;
}

export class PersistentEventBus extends EventBus {
  private logPath: string;
  private logStream: fs.FileHandle | null = null;

  constructor(config: PersistentEventBusConfig) {
    // Pass config to parent EventBus
    const maxHistorySize = parseInt(process.env.EVENT_HISTORY_LIMIT || "10000", 10);
    super({
      maxHistorySize,
      historyRetentionPolicy: "truncate",
    });
    this.logPath = path.join(config.workspacePath, config.projectId, "history.log");
  }

  async initialize() {
    // Ensure directory exists
    await fs.mkdir(path.dirname(this.logPath), { recursive: true });
    
    // Open append-only log file
    this.logStream = await fs.open(this.logPath, "a");

    // Load existing history if file exists
    await this.loadHistory();

    return this;
  }

  private async loadHistory() {
    try {
      const content = await fs.readFile(this.logPath, "utf-8");
      const lines = content.trim().split("\n").filter(Boolean);
      
      for (const line of lines) {
        try {
          const event: EventEnvelope = JSON.parse(line);
          // Access protected history field via type assertion
          (this as any).history.push(event);
        } catch (e) {
          // Skip invalid lines
          console.warn(`Skipped invalid history line: ${line}`);
        }
      }
    } catch (e: any) {
      if (e.code !== "ENOENT") {
        // File doesn't exist yet, that's OK
        throw e;
      }
    }
  }

  emit<T = any>(type: EventType, payload: T, meta?: Record<string, any>): EventEnvelope<T> {
    const envelope = super.emit(type, payload, meta);

    // Append to log file asynchronously
    if (this.logStream) {
      const line = JSON.stringify(envelope) + "\n";
      this.logStream.write(Buffer.from(line, "utf-8")).catch((err) => {
        console.error("Failed to write event to log:", err);
      });
    }

    return envelope;
  }

  async close() {
    if (this.logStream) {
      await this.logStream.close();
      this.logStream = null;
    }
  }
}

