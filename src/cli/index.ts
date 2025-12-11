#!/usr/bin/env node

/**
 * Arium CLI
 * Command-line interface for Arium platform
 */

import * as fs from "fs/promises";
import * as path from "path";
import { Command } from "commander";
import * as readline from "readline";

const program = new Command();

program
  .name("arium")
  .description("Arium AI IDE & Agent Platform CLI")
  .version("0.1.0");

// Start server command
program
  .command("serve")
  .description("Start Arium server")
  .option("-p, --port <port>", "Server port", "4000")
  .option("--host <host>", "Server host", "localhost")
  .action(async (options) => {
    process.env.PORT = options.port;
    console.log(`🚀 Starting Arium server on ${options.host}:${options.port}...`);
    
    // Import and start server
    const { startServer } = await import("../server/index");
    const { EventBus } = await import("../core/eventBus");
    const { PersistentEventBus, PersistentVFS } = await import("../core/storage");
    const { VFS } = await import("../core/vfs");
    const { ToolEngine } = await import("../core/tool-engine");
    const { AgentCore } = await import("../core/agent/agentCore");
    const { MockAdapter } = await import("../core/models/mockAdapter");
    const { OpenAIAdapter } = await import("../core/models/openaiAdapter");
    const { OllamaAdapter } = await import("../core/models/ollamaAdapter");
    const { registerBuiltinTools } = await import("../core/tools/builtinTools");

    const workspacePath = process.env.WORKSPACE_PATH || path.join(process.cwd(), "workspace");
    const projectId = process.env.PROJECT_ID || "default";
    const usePersistentStorage = process.env.PERSISTENT_STORAGE !== "false";

    let eventBus: any;
    let vfs: any;

    if (usePersistentStorage) {
      eventBus = await new PersistentEventBus({ workspacePath, projectId }).initialize();
      vfs = await new PersistentVFS(eventBus, { workspacePath, projectId }).initialize();
    } else {
      eventBus = new EventBus();
      vfs = new VFS(eventBus);
    }

    const toolEngine = new ToolEngine(eventBus);
    registerBuiltinTools(toolEngine, vfs);

    // Initialize model adapter
    let modelAdapter;
    if (process.env.OPENAI_API_KEY) {
      modelAdapter = new OpenAIAdapter({
        apiKey: process.env.OPENAI_API_KEY,
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      });
    } else if (process.env.USE_OLLAMA === "true" || process.env.OLLAMA_URL) {
      const ollamaAdapter = new OllamaAdapter({
        baseURL: process.env.OLLAMA_URL || "http://localhost:11434",
        model: process.env.OLLAMA_MODEL || "llama2",
      });
      const available = await ollamaAdapter.isAvailable();
      modelAdapter = available ? ollamaAdapter : new MockAdapter();
    } else {
      modelAdapter = new MockAdapter();
    }

    const agent = new AgentCore({
      id: "default-agent",
      model: modelAdapter,
    }, eventBus, toolEngine);

    await startServer({ agent, vfs, eventBus, toolEngine });
  });

// Agent run command
program
  .command("run <task>")
  .description("Run an agent task")
  .option("-m, --model <model>", "Model to use (openai, ollama, mock)", "mock")
  .action(async (task, options) => {
    console.log(`🤖 Running agent task: ${task}`);
    // Implementation would go here
    console.log("Agent task execution coming soon...");
  });

// Tools list command
program
  .command("tools")
  .description("List available tools")
  .action(async () => {
    console.log("Available tools:");
    console.log("  - fs.read");
    console.log("  - fs.write");
    console.log("  - fs.delete");
    console.log("  - fs.list");
    console.log("  - vfs.diff");
    console.log("  - vfs.snapshot");
    console.log("  - system.hash");
    console.log("  - system.info");
    console.log("  - text.process");
  });

// Project init command
program
  .command("init [project-name]")
  .description("Initialize a new Arium project")
  .action(async (projectName = "my-arium-project") => {
    const projectPath = path.join(process.cwd(), projectName);
    
    try {
      await fs.mkdir(projectPath, { recursive: true });
      await fs.mkdir(path.join(projectPath, "workspace"), { recursive: true });
      
      // Create .env.example
      const envExample = `# Arium Configuration
OPENAI_API_KEY=sk-xxxx
USE_OLLAMA=false
OLLAMA_URL=http://localhost:11434
PORT=4000
PERSISTENT_STORAGE=true
WORKSPACE_PATH=./workspace
PROJECT_ID=${projectName}
`;
      await fs.writeFile(path.join(projectPath, ".env.example"), envExample);
      
      console.log(`✅ Project "${projectName}" initialized at ${projectPath}`);
      console.log(`   Run: cd ${projectName} && npm install && npm run dev`);
    } catch (error: any) {
      console.error(`❌ Failed to initialize project: ${error.message}`);
      process.exit(1);
    }
  });

// Version command
program
  .command("version")
  .description("Show version information")
  .action(() => {
    console.log("Arium CLI v0.1.0");
    console.log("Arium Platform v0.1.0");
  });

program.parse();

