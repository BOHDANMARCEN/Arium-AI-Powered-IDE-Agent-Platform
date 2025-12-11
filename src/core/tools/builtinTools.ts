/**
 * Built-in tools for Arium
 * Common file system and utility operations
 */

import { ToolEngine } from "../tool-engine";
import { VFS } from "../vfs";

/**
 * Register all built-in tools to the tool engine
 */
export function registerBuiltinTools(toolEngine: ToolEngine, vfs: VFS) {
  // fs.read - Read file from VFS
  toolEngine.register(
    {
      id: "fs.read",
      name: "Read File",
      description: "Reads content from a file in the VFS",
      runner: "builtin",
      schema: {
        type: "object",
        properties: {
          path: { type: "string", description: "Path to the file" },
        },
        required: ["path"],
      },
      permissions: ["vfs.read"],
    },
    async (args) => {
      const content = vfs.read(args.path);
      if (content === null) {
        return {
          ok: false,
          error: { message: `File not found: ${args.path}`, code: "ENOENT" },
        };
      }
      return { ok: true, data: content };
    }
  );

  // fs.write - Write file to VFS
  toolEngine.register(
    {
      id: "fs.write",
      name: "Write File",
      description: "Writes content to a file in the VFS",
      runner: "builtin",
      schema: {
        type: "object",
        properties: {
          path: { type: "string", description: "Path to the file" },
          content: { type: "string", description: "File content" },
        },
        required: ["path", "content"],
      },
      permissions: ["vfs.write"],
    },
    async (args) => {
      const version = vfs.write(args.path, args.content, "agent");
      return { ok: true, data: { versionId: version.id, path: args.path } };
    }
  );

  // fs.delete - Delete file from VFS
  toolEngine.register(
    {
      id: "fs.delete",
      name: "Delete File",
      description: "Deletes a file from the VFS",
      runner: "builtin",
      schema: {
        type: "object",
        properties: {
          path: { type: "string", description: "Path to the file to delete" },
        },
        required: ["path"],
      },
      permissions: ["vfs.delete"],
    },
    async (args) => {
      const result = vfs.delete(args.path, "agent");
      if (!result.ok) {
        return {
          ok: false,
          error: { message: result.error?.message || "Failed to delete", path: args.path },
        };
      }
      return { ok: true, data: { path: args.path } };
    }
  );

  // fs.list - List files in VFS
  toolEngine.register(
    {
      id: "fs.list",
      name: "List Files",
      description: "Lists all files in the VFS",
      runner: "builtin",
      schema: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Optional path to list (not yet supported, lists all)",
          },
        },
        required: [],
      },
      permissions: ["vfs.read"],
    },
    async (args) => {
      const files = vfs.listFiles();
      return { ok: true, data: { files, count: files.length } };
    }
  );

  // vfs.diff - Get diff between versions
  toolEngine.register(
    {
      id: "vfs.diff",
      name: "File Diff",
      description: "Computes difference between two file versions",
      runner: "builtin",
      schema: {
        type: "object",
        properties: {
          versionA: { type: "string", description: "Version ID A" },
          versionB: { type: "string", description: "Version ID B" },
        },
        required: ["versionA", "versionB"],
      },
      permissions: ["vfs.read"],
    },
    async (args) => {
      const diff = vfs.diff(args.versionA, args.versionB);
      return { ok: true, data: diff };
    }
  );

  // vfs.snapshot - Create snapshot
  toolEngine.register(
    {
      id: "vfs.snapshot",
      name: "Create Snapshot",
      description: "Creates a snapshot of the current VFS state",
      runner: "builtin",
      schema: {
        type: "object",
        properties: {
          label: {
            type: "string",
            description: "Optional label for the snapshot",
          },
        },
        required: [],
      },
      permissions: ["vfs.read"],
    },
    async (args) => {
      const snapshotId = vfs.snapshot("agent");
      return {
        ok: true,
        data: { snapshotId, label: args.label || "auto-snapshot" },
      };
    }
  );

  // system.hash - Compute hash
  toolEngine.register(
    {
      id: "system.hash",
      name: "Compute Hash",
      description: "Computes a hash of text or file content",
      runner: "builtin",
      schema: {
        type: "object",
        properties: {
          input: {
            type: "string",
            description: "Text to hash, or path to file",
          },
          type: {
            type: "string",
            enum: ["text", "file"],
            description: "Type of input",
            default: "text",
          },
        },
        required: ["input"],
      },
      permissions: ["vfs.read"],
    },
    async (args) => {
      let content: string;
      
      if (args.type === "file") {
        const fileContent = vfs.read(args.input);
        if (fileContent === null) {
          return {
            ok: false,
            error: { message: `File not found: ${args.input}` },
          };
        }
        content = fileContent;
      } else {
        content = args.input;
      }

      // Simple hash function (FNV-1a)
      let hash = 2166136261 >>> 0;
      for (let i = 0; i < content.length; i++) {
        hash ^= content.charCodeAt(i);
        hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
      }
      const hashHex = (hash >>> 0).toString(16);

      return { ok: true, data: { hash: hashHex, input: args.input } };
    }
  );

  // text.process - Basic text processing
  toolEngine.register(
    {
      id: "text.process",
      name: "Process Text",
      description: "Basic text processing operations",
      runner: "builtin",
      schema: {
        type: "object",
        properties: {
          text: { type: "string", description: "Text to process" },
          operation: {
            type: "string",
            enum: ["uppercase", "lowercase", "reverse", "trim", "word-count"],
            description: "Operation to perform",
          },
        },
        required: ["text", "operation"],
      },
      permissions: [],
    },
    async (args) => {
      let result: string | number;
      
      switch (args.operation) {
        case "uppercase":
          result = args.text.toUpperCase();
          break;
        case "lowercase":
          result = args.text.toLowerCase();
          break;
        case "reverse":
          result = args.text.split("").reverse().join("");
          break;
        case "trim":
          result = args.text.trim();
          break;
        case "word-count":
          result = args.text.trim().split(/\s+/).filter((w: string) => w.length > 0).length;
          break;
        default:
          return {
            ok: false,
            error: { message: `Unknown operation: ${args.operation}` },
          };
      }

      return { ok: true, data: { result, operation: args.operation } };
    }
  );

  // system.info - System information
  toolEngine.register(
    {
      id: "system.info",
      name: "System Info",
      description: "Returns system information",
      runner: "builtin",
      schema: {
        type: "object",
        properties: {},
        required: [],
      },
      permissions: [],
    },
    async (args) => {
      return {
        ok: true,
        data: {
          platform: process.platform,
          nodeVersion: process.version,
          uptime: process.uptime(),
          memory: {
            used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
            total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
          },
        },
      };
    }
  );
}

