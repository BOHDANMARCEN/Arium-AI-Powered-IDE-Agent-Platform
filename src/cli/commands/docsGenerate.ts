/**
 * Arium CLI - Docs Generate Command
 * Generates comprehensive documentation for the entire platform
 *
 * Author: Bogdan Marcen & ChatGPT 5.1
 */

import { Command } from "commander";
import { loadConfig } from "../utils/loadConfig";
import { DocGenerator, ModelInfo, CliCommand } from "../../docs";

export function registerDocsGenerateCommand(program: Command) {
  program
    .command("docs:generate")
    .description("Generate comprehensive documentation")
    .option("--config <config>", "Path to arium.config.json", "./arium.config.json")
    .option("-o, --output <dir>", "Output directory for docs", "./docs")
    .option("--include-examples", "Include usage examples", true)
    .action(async (options) => {
      try {
        console.log("📚 Generating Arium Documentation...");
        console.log(`   Output: ${options.output}`);
        console.log("");

        // Load configuration
        const config = await loadConfig(options.config);

        // Import required modules
        const { EventBus } = await import("../../core/eventBus");
        const { ToolEngine } = await import("../../core/tool-engine");
        const { VFS } = await import("../../core/vfs");
        const { registerBuiltinTools } = await import("../../core/tools/builtinTools");

        // Setup components
        const eventBus = new EventBus();
        const vfs = new VFS(eventBus);
        const toolEngine = new ToolEngine(eventBus);
        registerBuiltinTools(toolEngine, vfs);

        // Create documentation generator
        const generator = new DocGenerator({
          outputDir: options.output,
          includeExamples: options.includeExamples,
        });

        // Generate tools documentation
        const tools = toolEngine.list().map(tool => ({
          name: tool.id,
          description: tool.description || "No description",
          input: tool.schema?.input || {} as any,
          output: tool.schema?.output || {} as any,
          permissions: tool.permissions || [],
        }));

        await generator.generateToolsDocs(tools);

        // Generate models documentation
        const models: ModelInfo[] = [
          {
            name: "OpenAI GPT",
            provider: "OpenAI",
            description: "OpenAI's GPT models for text generation and completion",
            config: config.models?.openai || {},
            capabilities: ["text-generation", "chat", "completion"],
          },
          {
            name: "Ollama",
            provider: "Ollama",
            description: "Local LLM models via Ollama",
            config: config.models?.ollama || {},
            capabilities: ["text-generation", "local-inference"],
          },
          {
            name: "Mock Adapter",
            provider: "Arium",
            description: "Mock adapter for testing and development",
            config: {},
            capabilities: ["testing", "development"],
          },
        ];

        await generator.generateModelsDocs(models);

        // Generate CLI documentation
        const commands: CliCommand[] = [
          {
            name: "init",
            description: "Initialize a new Arium project",
            options: [
              { flags: "[project-name]", description: "Name of the project" },
              { flags: "-t, --template <template>", description: "Project template" },
            ],
          },
          {
            name: "run <task>",
            description: "Run agent tasks or golden tests",
            options: [
              { flags: "-c, --case <case>", description: "Golden test case to run" },
              { flags: "-m, --model <model>", description: "Model to use" },
            ],
          },
          {
            name: "tools:list",
            description: "List all available tools",
            options: [
              { flags: "-f, --format <format>", description: "Output format (table, json)" },
            ],
          },
          {
            name: "tools:docs",
            description: "Generate documentation for tools",
            options: [
              { flags: "-o, --output <dir>", description: "Output directory" },
            ],
          },
          {
            name: "agent:debug",
            description: "Connect to agent debug WebSocket stream",
            options: [
              { flags: "--id <agent-id>", description: "Agent ID to debug" },
              { flags: "--host <host>", description: "Server host" },
              { flags: "--port <port>", description: "Server port" },
            ],
          },
          {
            name: "docs:generate",
            description: "Generate comprehensive documentation",
            options: [
              { flags: "-o, --output <dir>", description: "Output directory" },
            ],
          },
          {
            name: "serve",
            description: "Start Arium server",
            options: [
              { flags: "-p, --port <port>", description: "Server port" },
              { flags: "--host <host>", description: "Server host" },
            ],
          },
        ];

        await generator.generateCliDocs(commands);

        // Generate main README
        await generator.generateReadme();

        console.log("");
        console.log("✅ Documentation generation complete!");
        console.log(`   📁 Generated ${tools.length + 4} files in ${options.output}`);
        console.log("");
        console.log("Generated files:");
        console.log(`   • README.md - Main documentation index`);
        console.log(`   • tools.md - Tools reference`);
        console.log(`   • models.md - Models reference`);
        console.log(`   • cli.md - CLI reference`);
        console.log(`   • tools/*.md - Individual tool docs (${tools.length} files)`);

      } catch (error: any) {
        console.error(`❌ Failed to generate docs: ${error.message}`);
        process.exit(1);
      }
    });
}
