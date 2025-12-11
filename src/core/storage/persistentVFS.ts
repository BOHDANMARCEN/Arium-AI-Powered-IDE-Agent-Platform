/**
 * Persistent VFS with disk storage
 * Stores files in workspace/<project>/files/
 * Maintains versions and snapshots on disk
 */

import * as fs from "fs/promises";
import * as path from "path";
import { VFS, FileVersion } from "../vfs";
import { EventBus } from "../eventBus";
import { PathTraversalError, VFSError } from "../errors";

export interface PersistentVFSConfig {
  workspacePath: string;
  projectId: string;
  maxFileSize?: number; // Maximum file size in bytes (default: 10MB)
}

export class PersistentVFS extends VFS {
  private filesDir: string;
  private snapshotsDir: string;
  private versionsDir: string;
  private workspaceRoot: string;
  private maxFileSize: number;

  constructor(eventBus: EventBus, config: PersistentVFSConfig) {
    super(eventBus);
    this.workspaceRoot = path.resolve(config.workspacePath);
    this.filesDir = path.join(this.workspaceRoot, config.projectId, "files");
    this.snapshotsDir = path.join(this.workspaceRoot, config.projectId, "snapshots");
    this.versionsDir = path.join(this.workspaceRoot, config.projectId, "versions");
    this.maxFileSize = config.maxFileSize ?? 10_000_000; // Default 10MB
  }

  /**
   * Resolve and validate VFS path to prevent path traversal attacks
   * @throws PathTraversalError if path is invalid or attempts traversal
   */
  private resolveVfsPath(userPath: string): string {
    if (!userPath || typeof userPath !== "string") {
      throw new PathTraversalError("Empty or invalid path");
    }

    // Reject null bytes
    if (userPath.includes("\0")) {
      throw new PathTraversalError("Path contains null bytes");
    }

    // Decode URI-encoded input (handles %2e%2e%2f, etc.)
    let decoded: string;
    try {
      decoded = decodeURIComponent(userPath);
    } catch {
      decoded = userPath; // If decoding fails, use original
    }

    // Remove leading slashes and normalize
    const cleaned = decoded.replace(/^[/\\]+/, "");

    // Check for traversal sequences (including encoded)
    if (
      cleaned.includes("..") ||
      cleaned.match(/%2e|%2f|%5c/i) ||
      path.isAbsolute(cleaned)
    ) {
      throw new PathTraversalError(userPath);
    }

    // Resolve to absolute path within workspace
    const resolved = path.resolve(this.filesDir, cleaned);
    const filesDirResolved = path.resolve(this.filesDir);

    // Ensure resolved path is within filesDir
    if (!resolved.startsWith(filesDirResolved + path.sep) && resolved !== filesDirResolved) {
      throw new PathTraversalError(userPath);
    }

    return path.relative(filesDirResolved, resolved);
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
    // Validate file size before writing
    if (content.length > this.maxFileSize) {
      throw new VFSError(
        `File too large: ${content.length} bytes (max: ${this.maxFileSize})`,
        pathStr
      );
    }

    // Validate path
    this.resolveVfsPath(pathStr);

    const version = super.write(pathStr, content, author);

    // Persist to disk asynchronously with atomic write
    this.persistFileAtomic(pathStr, content, version).catch((err) => {
      console.error(`Failed to persist file ${pathStr}:`, err);
    });

    // Save version metadata
    this.persistVersion(version).catch((err) => {
      console.error(`Failed to persist version ${version.id}:`, err);
    });

    return version;
  }

  /**
   * Atomic file write: write to temp file then rename (atomic operation)
   */
  private async persistFileAtomic(pathStr: string, content: string, version: FileVersion) {
    // Resolve and validate path
    const safePath = this.resolveVfsPath(pathStr);
    const filePath = path.join(this.filesDir, safePath);
    
    // Ensure parent directories exist
    const dir = path.dirname(filePath);
    if (dir !== this.filesDir) {
      await fs.mkdir(dir, { recursive: true });
    }
    
    // Write to temporary file first
    const tmpPath = filePath + ".tmp-" + Date.now() + "-" + Math.random().toString(36).substring(2, 11);
    
    try {
      await fs.writeFile(tmpPath, content, "utf-8");
      // Atomic rename (works on most filesystems)
      await fs.rename(tmpPath, filePath);
    } catch (error: any) {
      // Clean up temp file on error
      try {
        await fs.unlink(tmpPath).catch(() => {
          // Ignore if file doesn't exist
        });
      } catch {
        // Ignore cleanup errors
      }
      throw error;
    }
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

  /**
   * Validate path for read operations
   */
  read(pathStr: string): string | null {
    try {
      this.resolveVfsPath(pathStr);
    } catch (error) {
      // If path is invalid, return null (file not found)
      return null;
    }
    return super.read(pathStr);
  }

  /**
   * Validate path for delete operations
   */
  delete(pathStr: string, author?: string) {
    try {
      this.resolveVfsPath(pathStr);
    } catch (error) {
      return { ok: false, error: { message: "Invalid path", path: pathStr } };
    }
    return super.delete(pathStr, author);
  }

  protected simpleHash(s: string): string {
    // Use parent class method
    return super.simpleHash(s);
  }
}

