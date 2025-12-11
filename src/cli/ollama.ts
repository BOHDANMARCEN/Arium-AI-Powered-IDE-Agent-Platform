/**
 * Ollama CLI commands
 */

import { Command } from "commander";
import { OllamaManager } from "../core/ollama/manager";

export function registerOllamaCommands(program: Command) {
  const ollamaCmd = program
    .command("ollama")
    .description("Manage Ollama service and models");

  ollamaCmd
    .command("status")
    .description("Check Ollama service status")
    .action(async () => {
      const manager = new OllamaManager({
        baseURL: process.env.OLLAMA_URL || "http://localhost:11434",
      });

      const isAvailable = await manager.isAvailable();
      if (isAvailable) {
        console.log("✅ Ollama is running");
        try {
          const models = await manager.listModels();
          console.log(`\n📦 Available models (${models.length}):`);
          models.forEach((model) => {
            console.log(`   - ${model.name} (${model.size})`);
          });
        } catch (error: any) {
          console.error("❌ Error listing models:", error.message);
        }
      } else {
        console.log("❌ Ollama is not running");
        console.log("   Start it with: ollama serve");
        console.log("   Or use: arium ollama start");
      }
    });

  ollamaCmd
    .command("start")
    .description("Start Ollama service")
    .action(async () => {
      const manager = new OllamaManager({
        baseURL: process.env.OLLAMA_URL || "http://localhost:11434",
        autoStart: true,
      });

      try {
        await manager.start();
        console.log("✅ Ollama started successfully");
      } catch (error: any) {
        console.error("❌ Failed to start Ollama:", error.message);
        process.exit(1);
      }
    });

  ollamaCmd
    .command("list")
    .description("List available Ollama models")
    .action(async () => {
      const manager = new OllamaManager({
        baseURL: process.env.OLLAMA_URL || "http://localhost:11434",
      });

      try {
        const models = await manager.listModels();
        if (models.length === 0) {
          console.log("No models found. Pull a model with: ollama pull <model-name>");
          return;
        }

        console.log(`\n📦 Available models (${models.length}):\n`);
        models.forEach((model, index) => {
          console.log(`${index + 1}. ${model.name}`);
          console.log(`   Size: ${model.size}`);
          console.log(`   Modified: ${model.modified}\n`);
        });

        const recommended = await manager.getRecommendedModel();
        if (recommended) {
          console.log(`💡 Recommended: ${recommended}`);
        }
      } catch (error: any) {
        console.error("❌ Error:", error.message);
        process.exit(1);
      }
    });

  ollamaCmd
    .command("recommend")
    .description("Get recommended model for Arium")
    .action(async () => {
      const manager = new OllamaManager({
        baseURL: process.env.OLLAMA_URL || "http://localhost:11434",
        defaultModel: process.env.OLLAMA_MODEL,
      });

      try {
        const recommended = await manager.getRecommendedModel();
        if (recommended) {
          console.log(`💡 Recommended model: ${recommended}`);
          console.log(`\nAdd to .env:`);
          console.log(`OLLAMA_MODEL=${recommended}`);
        } else {
          console.log("❌ No models available");
          console.log("   Pull a model with: ollama pull <model-name>");
        }
      } catch (error: any) {
        console.error("❌ Error:", error.message);
        process.exit(1);
      }
    });
}

