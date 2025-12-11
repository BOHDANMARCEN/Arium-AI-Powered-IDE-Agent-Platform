/**
 * Bootstrap core + server
 */

import "dotenv/config";
import * as path from "path";
import { EventBus } from "./core/eventBus";
import { VFS } from "./core/vfs";
import { PersistentEventBus, PersistentVFS } from "./core/storage";
import { ToolEngine } from "./core/tool-engine";
import { AgentCore } from "./core/agent/agentCore";
import { MockAdapter } from "./core/models/mockAdapter";
import { OpenAIAdapter } from "./core/models/openaiAdapter";
import { OllamaAdapter } from "./core/models/ollamaAdapter";

import { startServer } from "./server/index";
import { registerBuiltinTools } from "./core/tools/builtinTools";

async function main() {
  // Configuration
  const workspacePath = process.env.WORKSPACE_PATH || path.join(process.cwd(), "workspace");
  const projectId = process.env.PROJECT_ID || "default";

  // Initialize persistent storage
  const usePersistentStorage = process.env.PERSISTENT_STORAGE !== "false";
  
  let eventBus: EventBus;
  let vfs: VFS;

  if (usePersistentStorage) {
    console.log(`📦 Using persistent storage: ${workspacePath}/${projectId}`);
    
    // Persistent EventBus
    eventBus = await new PersistentEventBus({
      workspacePath,
      projectId,
    }).initialize();

    // Persistent VFS
    vfs = await new PersistentVFS(eventBus, {
      workspacePath,
      projectId,
    }).initialize();
  } else {
    console.log("💾 Using in-memory storage");
    eventBus = new EventBus();
    vfs = new VFS(eventBus);
  }

  // simple logging listener
  eventBus.on("any", evt => {
    console.log(`[EVENT] ${evt.type} ${evt.id} ${new Date(evt.timestamp).toISOString()}`);
  });

  const toolEngine = new ToolEngine(eventBus);

  // Register all built-in tools
  registerBuiltinTools(toolEngine, vfs);

  // Example: Register a JavaScript tool (sandboxed)
  toolEngine.register({
    id: "text.word-count",
    name: "Word Counter (JS)",
    description: "Counts words in text using JavaScript",
    runner: "js",
    schema: {
      type: "object",
      properties: {
        text: { type: "string" }
      },
      required: ["text"]
    }
  }, `
    export default async function run(args) {
      const words = args.text.trim().split(/\\s+/).filter(word => word.length > 0);
      return {
        ok: true,
        data: {
          wordCount: words.length,
          characterCount: args.text.length,
          words: words.slice(0, 10) // First 10 words
        }
      };
    }
  `);

  // Example: Register a Python tool (sandboxed)
  toolEngine.register({
    id: "text.word-count-py",
    name: "Word Counter (Python)",
    description: "Counts words in text using Python",
    runner: "py",
    schema: {
      type: "object",
      properties: {
        text: { type: "string" }
      },
      required: ["text"]
    }
  }, `
def run(args):
    text = args.get("text", "")
    if not text:
        return {
            "ok": False,
            "error": {"message": "Missing required parameter: text"}
        }
    
    words = [w for w in text.strip().split() if w]
    
    return {
        "ok": True,
        "data": {
            "wordCount": len(words),
            "characterCount": len(text),
            "words": words[:10]
        }
    }
  `);

  // bootstrap file
  vfs.write("src/main.ts", "// hello world\n", "bootstrap");

  // Initialize model adapter
  // Use OpenAI if API key is provided, otherwise fall back to MockAdapter
  let modelAdapter;
  if (process.env.OPENAI_API_KEY) {
    console.log("Using OpenAI adapter");
    modelAdapter = new OpenAIAdapter({
      apiKey: process.env.OPENAI_API_KEY,
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
    });
  } else {
    console.log("Using Mock adapter (set OPENAI_API_KEY to use OpenAI)");
    modelAdapter = new MockAdapter();
  }

  const agent = new AgentCore(
    {
      id: "default-agent",
      model: modelAdapter,
      temperature: 0.0,
      maxTokens: 2048,
    },
    eventBus,
    toolEngine
  );

  await startServer({ agent, vfs, eventBus, toolEngine });
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});

// Graceful shutdown
process.on("SIGINT", async () => {
  console.log("\n🛑 Shutting down gracefully...");
  // Close persistent storage if needed
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.log("\n🛑 Shutting down gracefully...");
  process.exit(0);
});
