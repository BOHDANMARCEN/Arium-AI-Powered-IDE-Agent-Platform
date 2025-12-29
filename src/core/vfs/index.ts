/**
 * Minimal in-memory VFS with versions & snapshots.
 * Replace persistence with FS/DB when ready.
 */

import { ulid } from "ulid";
import { EventBus } from "../eventBus";
import { PathTraversalError } from "../errors";
import { validatePathLength } from "../utils/pathSecurity";
import { FileVersion } from "./types";

// Export the type for use in other modules
export type { FileVersion };

export class VFS {
  private files: Map<string, FileVersion> = new Map();
  private versions: Map<string, FileVersion> = new Map();
  private snapshots: Map<string, Record<string, string>> = new Map();
  constructor(private eventBus: EventBus) {}

  read(path: string): string | null {
    // Validate path before reading
    if (!path || typeof path !== "string") {
      throw new PathTraversalError("Empty or invalid path");
    }
    
    try {
      validatePathLength(path, 1024);
    } catch (err) {
      throw new PathTraversalError(err instanceof Error ? err.message : String(err));
    }
    
    if (path.includes("\0")) {
      throw new PathTraversalError("Path contains null bytes");
    }
    
    if (path.includes("..") || path.startsWith("/") || path.startsWith("\\")) {
      throw new PathTraversalError(path);
    }
    
    const v = this.files.get(path);
    return v ? v.content : null;
  }

  write(path: string, content: string, author?: string) {
    // Basic validation: reject null bytes and empty paths
    if (!path || typeof path !== "string") {
      throw new PathTraversalError("Empty or invalid path");
    }
    
    // Validate path length (1024 chars max)
    try {
      validatePathLength(path, 1024);
    } catch (err) {
      throw new PathTraversalError(err instanceof Error ? err.message : String(err));
    }
    
    if (path.includes("\0")) {
      throw new PathTraversalError("Path contains null bytes");
    }

    // Check for basic traversal attempts (in-memory VFS)
    if (path.includes("..") || path.startsWith("/") || path.startsWith("\\")) {
      throw new PathTraversalError(path);
    }

    const prev = this.files.get(path)?.id;
    const ver: FileVersion = {
      id: ulid(),
      content,
      timestamp: Date.now(),
      author,
      prev,
      hash: this.simpleHash(content),
    };
    this.files.set(path, ver);
    this.versions.set(ver.id, ver);

    this.eventBus.emit("VFSChangeEvent", {
      path,
      versionId: ver.id,
      author,
    });

    return ver;
  }

  snapshot(author?: string) {
    const id = ulid();
    const state: Record<string, string> = {};
    for (const [path, ver] of this.files.entries()) state[path] = ver.content;
    this.snapshots.set(id, state);
    this.eventBus.emit("VFSChangeEvent", { snapshotId: id, author });
    return id;
  }

  diff(versionA: string | null, versionB: string | null) {
    // very simple diff: return list of changed files and sizes
    const a = versionA ? this.versions.get(versionA) : null;
    const b = versionB ? this.versions.get(versionB) : null;
    if (!a && !b) return { a: null, b: null };
    // For demo, return minimal info:
    return { a: a?.id ?? null, b: b?.id ?? null };
  }

  listFiles() {
    return Array.from(this.files.keys());
  }

  getVersion(id: string) {
    return this.versions.get(id) ?? null;
  }

  delete(path: string, author?: string) {
    // Validate path before deletion
    if (!path || typeof path !== "string") {
      throw new PathTraversalError("Empty or invalid path");
    }
    
    try {
      validatePathLength(path, 1024);
    } catch (err) {
      throw new PathTraversalError(err instanceof Error ? err.message : String(err));
    }
    
    if (path.includes("\0")) {
      throw new PathTraversalError("Path contains null bytes");
    }
    
    if (path.includes("..") || path.startsWith("/") || path.startsWith("\\")) {
      throw new PathTraversalError(path);
    }
    
    const existed = this.files.has(path);
    if (existed) {
      this.files.delete(path);
      this.eventBus.emit("VFSChangeEvent", {
        path,
        action: "delete",
        author,
      });
      return { ok: true, path };
    }
    return { ok: false, error: { message: "File not found", path } };
  }

  protected simpleHash(s: string) {
    // non-cryptographic small hash for demo
    let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24);
    }
    return (h >>> 0).toString(16);
  }
}