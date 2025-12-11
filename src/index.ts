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

    // Persistent VFS with max file size
    const maxFileSize = parseInt(process.env.VFS_MAX_FILE_BYTES || "10000000", 10);
    const persistentVFS = await new PersistentVFS(eventBus, {
      workspacePath,
      projectId,
      maxFileSize,
    }).initialize();
    vfs = persistentVFS as VFS;
  } else {
    console.log("💾 Using in-memory storage");
    const maxHistorySize = parseInt(process.env.EVENT_HISTORY_LIMIT || "10000", 10);
    eventBus = new EventBus({
      maxHistorySize,
      historyRetentionPolicy: "truncate",
    });
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
    async function run(args) {
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
  // Priority: OpenAI > Ollama > MockAdapter
  let modelAdapter;
  if (process.env.OPENAI_API_KEY) {
    console.log("🤖 Using OpenAI adapter");
    modelAdapter = new OpenAIAdapter({
      apiKey: process.env.OPENAI_API_KEY,
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
    });
  } else if (process.env.USE_OLLAMA === "true" || process.env.OLLAMA_URL || process.env.OLLAMA_MODEL) {
    const ollamaConfig = {
      baseURL: process.env.OLLAMA_URL || process.env.OLLAMA_BASE_URL || "http://localhost:11434",
      model: process.env.OLLAMA_MODEL || "llama3.2:3b",
    };
    console.log(`🦙 Using Ollama adapter: ${ollamaConfig.model} at ${ollamaConfig.baseURL}`);
    modelAdapter = new OllamaAdapter(ollamaConfig);
    
    // Test Ollama connection
    try {
      const isAvailable = await (modelAdapter as OllamaAdapter).isAvailable();
      if (!isAvailable) {
        console.warn("⚠️  Ollama server not available. Falling back to MockAdapter.");
        console.warn("   Make sure Ollama is running: ollama serve");
        modelAdapter = new MockAdapter();
      } else {
        const models = await (modelAdapter as OllamaAdapter).listModels();
        console.log(`✅ Ollama connected. Available models: ${models.join(", ")}`);
        console.log(`📌 Using model: ${ollamaConfig.model}`);
      }
    } catch (error: any) {
      console.warn(`⚠️  Ollama connection failed: ${error.message}`);
      console.warn("   Falling back to MockAdapter.");
      modelAdapter = new MockAdapter();
    }
  } else {
    console.log("🎭 Using Mock adapter");
    console.log("   Set OPENAI_API_KEY to use OpenAI, or USE_OLLAMA=true to use Ollama");
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

  console.log("");
  console.log("🔧 Initializing server...");
  await startServer({ agent, vfs, eventBus, toolEngine });
  console.log("✅ Server initialization complete!");
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
