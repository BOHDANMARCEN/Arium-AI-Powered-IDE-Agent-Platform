/**
 * Bootstrap core + server
 */

import "dotenv/config";
import path from "path";
import { EventBus } from "./core/eventBus";
import { VFS } from "./core/vfs";
import { PersistentEventBus, PersistentVFS } from "./core/storage";
import { ToolEngine } from "./core/tool-engine";
import { AgentCore } from "./core/agent/agentCore";
import { MockAdapter } from "./core/models/mockAdapter";
import { OpenAIAdapter } from "./core/models/openaiAdapter";
import { OllamaAdapter } from "./core/models/ollama";

import { startServer } from "./server/index";
import { registerBuiltinTools } from "./core/tools/builtinTools";
import { initializeLogger, logger } from "./core/logger";
import { parseLogLevel, parseLogFormat } from "./core/logger/config";

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

  // Initialize logger with Pino
  const logLevel = parseLogLevel(process.env.LOG_LEVEL);
  const logFormat = parseLogFormat(process.env.LOG_FORMAT);

  const loggerInstance = initializeLogger(eventBus, {
    level: logLevel,
    format: logFormat,
    file: {
      enabled: process.env.LOG_FILE_ENABLED === "true",
      path: process.env.LOG_FILE_PATH || "./logs/arium.log",
    },
  });

  logger.info("🚀 Starting Arium AI IDE Platform", {
    workspacePath,
    projectId,
    usePersistentStorage,
    logLevel,
    logFormat,
  });

  const toolEngine = new ToolEngine(eventBus);

  // Register all built-in tools
  registerBuiltinTools(toolEngine, vfs);

  // bootstrap file
  vfs.write("src/main.ts", "// hello world\n", "bootstrap");

  // Initialize model adapter
  // Priority: OpenAI > MockAdapter
  let modelAdapter;
  const modelProvider = process.env.MODEL_PROVIDER?.toLowerCase();
  const useOllama = modelProvider === "ollama" || process.env.USE_OLLAMA === "true";

  if (useOllama) {
    console.log("🦙 Using Ollama adapter");
    const baseURL =
      process.env.OLLAMA_HOST ||
      process.env.OLLAMA_URL ||
      "http://localhost:11434";

    const ollamaAdapter = new OllamaAdapter(eventBus, {
      defaultModel: process.env.OLLAMA_MODEL,
      baseURL,
    });
    await ollamaAdapter.init();
    modelAdapter = ollamaAdapter;
  } else if (process.env.OPENAI_API_KEY) {
    console.log("🤖 Using OpenAI adapter");
    modelAdapter = new OpenAIAdapter({
      apiKey: process.env.OPENAI_API_KEY,
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
    }, eventBus);
  } else {
    console.log("🎭 Using Mock adapter");
    console.log("   Set OPENAI_API_KEY to use OpenAI, or USE_OLLAMA=true for Ollama.");
    modelAdapter = new MockAdapter(eventBus);
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

export {};
