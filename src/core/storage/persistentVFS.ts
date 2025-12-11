/**
 * Persistent VFS with disk storage
 * Stores files in workspace/<project>/files/
 * Maintains versions and snapshots on disk
 */

import * as fs from "fs/promises";
import * as path from "path";
import { VFS, FileVersion } from "../vfs";
import { EventBus } from "../eventBus";

export interface PersistentVFSConfig {
  workspacePath: string;
  projectId: string;
}

export class PersistentVFS extends VFS {
  private filesDir: string;
  private snapshotsDir: string;
  private versionsDir: string;

  constructor(eventBus: EventBus, config: PersistentVFSConfig) {
    super(eventBus);
    this.filesDir = path.join(config.workspacePath, config.projectId, "files");
    this.snapshotsDir = path.join(config.workspacePath, config.projectId, "snapshots");
    this.versionsDir = path.join(config.workspacePath, config.projectId, "versions");
  }

  async initialize() {
    // Ensure directories exist
    await fs.mkdir(this.filesDir, { recursive: true });
    await fs.mkdir(this.snapshotsDir, { recursive: true });
    await fs.mkdir(this.versionsDir, { recursive: true });

    // Load existing files from disk
    await this.loadFromDisk();

    return this;
  }

  private async loadFromDisk() {
    try {
      await this.loadDirectory(this.filesDir, "");
    } catch (e: any) {
      if (e.code !== "ENOENT") {
        throw e;
      }
    }
  }

  private async loadDirectory(dirPath: string, relativePrefix: string) {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      
      if (entry.isFile()) {
        const content = await fs.readFile(fullPath, "utf-8");
        const relativePath = relativePrefix ? `${relativePrefix}/${entry.name}` : entry.name;
        
        const version: FileVersion = {
          id: `ver-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
          content,
          timestamp: (await fs.stat(fullPath)).mtimeMs,
          author: "disk-load",
          hash: this.simpleHash(content),
        };

        (this as any).files.set(relativePath, version);
        (this as any).versions.set(version.id, version);
      } else if (entry.isDirectory()) {
        // Recursively load subdirectories
        const newPrefix = relativePrefix ? `${relativePrefix}/${entry.name}` : entry.name;
        await this.loadDirectory(fullPath, newPrefix);
      }
    }
  }

  write(pathStr: string, content: string, author?: string): FileVersion {
    const version = super.write(pathStr, content, author);

    // Persist to disk asynchronously
    this.persistFile(pathStr, content, version).catch((err) => {
      console.error(`Failed to persist file ${pathStr}:`, err);
    });

    // Save version metadata
    this.persistVersion(version).catch((err) => {
      console.error(`Failed to persist version ${version.id}:`, err);
    });

    return version;
  }

  private async persistFile(pathStr: string, content: string, version: FileVersion) {
    // Sanitize path for filesystem
    const safePath = this.sanitizePath(pathStr);
    const filePath = path.join(this.filesDir, safePath);
    
    // Ensure parent directories exist
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    
    // Write file
    await fs.writeFile(filePath, content, "utf-8");
  }

  private async persistVersion(version: FileVersion) {
    const versionPath = path.join(this.versionsDir, `${version.id}.json`);
    await fs.writeFile(versionPath, JSON.stringify(version, null, 2), "utf-8");
  }

  snapshot(author?: string): string {
    const snapshotId = super.snapshot(author);

    // Persist snapshot to disk
    this.persistSnapshot(snapshotId).catch((err) => {
      console.error(`Failed to persist snapshot ${snapshotId}:`, err);
    });

    return snapshotId;
  }

  private async persistSnapshot(snapshotId: string) {
    const snapshots = (this as any).snapshots;
    const state = snapshots.get(snapshotId);
    
    if (!state) return;

    const snapshotPath = path.join(this.snapshotsDir, `${snapshotId}.json`);
    await fs.writeFile(snapshotPath, JSON.stringify(state, null, 2), "utf-8");
  }

  private sanitizePath(pathStr: string): string {
    // Remove leading slashes and normalize
    let safe = pathStr.replace(/^\/+/, "");
    
    // Replace path separators that might be problematic
    safe = safe.replace(/\.\./g, ""); // Remove .. sequences
    
    // Ensure it's a relative path
    return path.normalize(safe);
  }

  private simpleHash(s: string): string {
    // Re-export from parent class (or duplicate if needed)
    let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24);
    }
    return (h >>> 0).toString(16);
  }
}

