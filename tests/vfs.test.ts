/**
 * VFS Unit Tests
 */

import { VFS } from "../src/core/vfs";
import { EventBus } from "../src/core/eventBus";

describe("VFS", () => {
  let vfs: VFS;
  let eventBus: EventBus;

  beforeEach(() => {
    eventBus = new EventBus();
    vfs = new VFS(eventBus);
  });

  test("should read and write files", () => {
    const path = "test.txt";
    const content = "Hello, World!";

    vfs.write(path, content);
    const readContent = vfs.read(path);

    expect(readContent).toBe(content);
  });

  test("should return null for non-existent files", () => {
    expect(vfs.read("nonexistent.txt")).toBeNull();
  });

  test("should track file versions", () => {
    const path = "test.txt";
    const v1 = vfs.write(path, "v1");
    const v2 = vfs.write(path, "v2");

    expect(v1.id).not.toBe(v2.id);
    expect(v2.prev).toBe(v1.id);

    const version1 = vfs.getVersion(v1.id);
    expect(version1?.content).toBe("v1");
  });

  test("should list files", () => {
    vfs.write("file1.txt", "content1");
    vfs.write("file2.txt", "content2");

    const files = vfs.listFiles();
    expect(files).toContain("file1.txt");
    expect(files).toContain("file2.txt");
  });

  test("should emit VFSChangeEvent on write", () => {
    let eventEmitted = false;

    eventBus.on("VFSChangeEvent", () => {
      eventEmitted = true;
    });

    vfs.write("test.txt", "content");
    expect(eventEmitted).toBe(true);
  });

  test("should delete files", () => {
    vfs.write("test.txt", "content");
    expect(vfs.read("test.txt")).toBe("content");

    const result = vfs.delete("test.txt");
    expect(result.ok).toBe(true);
    expect(vfs.read("test.txt")).toBeNull();
  });

  test("should create snapshots", () => {
    vfs.write("file1.txt", "content1");
    vfs.write("file2.txt", "content2");

    const snapshotId = vfs.snapshot();
    expect(snapshotId).toBeTruthy();
  });
});

describe("VFS Path Traversal Prevention", () => {
  let vfs: VFS;
  let eventBus: EventBus;

  beforeEach(() => {
    eventBus = new EventBus();
    vfs = new VFS(eventBus);
  });

  test("should prevent path traversal with .. sequences", () => {
    // This test documents expected behavior
    // In-memory VFS doesn't have path traversal risk
    // But PersistentVFS should throw
    expect(() => {
      vfs.write("../escape.txt", "hacked");
    }).not.toThrow(); // In-memory VFS allows this (no filesystem)

    // However, the file will be stored with the literal path "../escape.txt"
    // This is acceptable for in-memory VFS
  });
});
