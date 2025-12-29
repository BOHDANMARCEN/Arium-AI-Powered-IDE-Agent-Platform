/**
 * VFS Path Traversal Security Tests
 * Tests for VFS-001: Path traversal protection
 */

import { EventBus } from "../src/core/eventBus";
import { PersistentVFS } from "../src/core/storage/persistentVFS";
import { PathTraversalError, VFSError } from "../src/core/errors";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";

describe("VFS Path Traversal Protection", () => {
  let vfs: PersistentVFS;
  let eventBus: EventBus;
  let workspaceDir: string;

  beforeEach(async () => {
    eventBus = new EventBus();
    workspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), "arium-test-"));
    
    vfs = new PersistentVFS(eventBus, {
      workspacePath: workspaceDir,
      projectId: "test",
      maxFileSize: 10_000_000, // 10MB
    });
    
    await vfs.initialize();
  });

  afterEach(async () => {
    // Cleanup
    try {
      await fs.rm(workspaceDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  test("should reject path traversal with ..", () => {
    expect(() => {
      vfs.write("../../etc/passwd", "hacked");
    }).toThrow(PathTraversalError);
  });

  test("should reject encoded path traversal", () => {
    expect(() => {
      vfs.write("%2e%2e%2fetc%2fpasswd", "hacked");
    }).toThrow(PathTraversalError);
  });

  test("should reject absolute paths", () => {
    expect(() => {
      vfs.write("/etc/passwd", "hacked");
    }).toThrow(PathTraversalError);
  });

  test("should reject paths with null bytes", () => {
    expect(() => {
      vfs.write("file\0.txt", "content");
    }).toThrow(PathTraversalError);
  });

  test("should allow valid relative paths", () => {
    expect(() => {
      vfs.write("src/main.ts", "console.log('hello');");
    }).not.toThrow();
  });

  test("should reject files larger than maxFileSize", () => {
    const largeContent = "x".repeat(10_000_001); // 10MB + 1 byte
    
    expect(() => {
      vfs.write("large.txt", largeContent);
    }).toThrow(VFSError);
  });

  test("should allow files up to maxFileSize", () => {
    const validContent = "x".repeat(10_000_000); // Exactly 10MB
    
    expect(() => {
      vfs.write("valid.txt", validContent);
    }).not.toThrow();
    
    const content = vfs.read("valid.txt");
    expect(content).toBe(validContent);
  });

  test("should prevent traversal in read operations", () => {
    const content = vfs.read("../../etc/passwd");
    expect(content).toBeNull(); // Should return null for invalid paths
  });

  test("should prevent traversal in delete operations", () => {
    const result = vfs.delete("../../etc/passwd");
    expect(result.ok).toBe(false);
    expect(result.error?.message).toContain("Invalid path");
  });

  test("should use atomic writes (no temp file left behind)", async () => {
    const testPath = "test-atomic.txt";
    const content = "test content";
    
    vfs.write(testPath, content);
    
    // Wait a bit for async write to complete
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Check that no .tmp files exist
    const filesDir = path.join(workspaceDir, "test", "files");
    const files = await fs.readdir(filesDir, { recursive: true });
    
    const tempFiles = files.filter((f: string) => f.includes(".tmp-"));
    expect(tempFiles.length).toBe(0);
    
    // Verify file was written correctly
    const readContent = vfs.read(testPath);
    expect(readContent).toBe(content);
  });
});
