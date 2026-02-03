import path from "path";
import { readFile } from "fs/promises";
import { EventBus } from "../../eventBus";
import { ModelAdapter, ModelInput, ModelOutput } from "../adapter";
import { ModelError } from "../../errors/standardErrors";
import { Result } from "../../utils/result";
import { OllamaClient } from "./OllamaClient";
import { OllamaGenerateInput, OllamaGenerateResult, OllamaMessage, OllamaModelInfo } from "./types";

export interface OllamaAdapterConfig {
  defaultModel?: string;
  executable?: string;
  baseURL?: string;
  cacheTtlMs?: number;
  modelAllowlist?: string[];
}

export class OllamaAdapter implements ModelAdapter {
  id = "ollama";
  supportsStreaming = false;
  eventBus: EventBus;
  private client: OllamaClient;
  private availableModels: OllamaModelInfo[] = [];
  private defaultModel?: string;
  private explicitDefaultModel?: string;
  private envDefaultModel?: string;
  private modelAllowlist?: string[];
  private configDefaultModel?: string;
  private configDefaultLoaded = false;

  constructor(eventBus: EventBus, config: OllamaAdapterConfig = {}) {
    this.eventBus = eventBus;

    const baseURL =
      config.baseURL ||
      process.env.OLLAMA_HOST ||
      process.env.OLLAMA_URL ||
      "http://localhost:11434";

    this.client = new OllamaClient({
      executable: config.executable,
      baseURL,
      cacheTtlMs: config.cacheTtlMs,
    });

    this.explicitDefaultModel = config.defaultModel;
    this.envDefaultModel = process.env.OLLAMA_MODEL;
    this.modelAllowlist =
      config.modelAllowlist && config.modelAllowlist.length > 0
        ? config.modelAllowlist
        : this.parseAllowlist(process.env.OLLAMA_MODEL_ALLOWLIST);
  }

  async init(): Promise<void> {
    const models = await this.listModels({ refresh: true });

    if (models.length === 0) {
      throw new Error("No Ollama models available. Pull a model with `ollama pull <model>`.");
    }

    this.defaultModel = await this.resolveDefaultModel(models);

    this.eventBus.emit("ollama.ready", { models: this.availableModels });
  }

  getAvailableModels(): OllamaModelInfo[] {
    return [...this.availableModels];
  }

  async listModels(options: { refresh?: boolean } = {}): Promise<string[]> {
    const models = await this.client.listModels({ refresh: options.refresh });
    const filtered = this.applyAllowlist(models);
    this.availableModels = filtered.map((name) => ({ name }));
    return filtered;
  }

  async generate(input: OllamaGenerateInput, modelName?: string): Promise<OllamaGenerateResult>;
  async generate(input: ModelInput): Promise<Result<ModelOutput, ModelError>>;
  async generate(
    input: OllamaGenerateInput | ModelInput,
    modelName?: string
  ): Promise<OllamaGenerateResult | Result<ModelOutput, ModelError>> {
    if ("messages" in input) {
      return this.generateFromMessages(input, modelName);
    }

    const messages: OllamaMessage[] = [];
    if (input.context) {
      messages.push(...input.context.map((content) => ({ role: "system" as const, content })));
    }
    messages.push({ role: "user", content: input.prompt });

    try {
      const result = await this.generateFromMessages({ messages }, modelName);
      return {
        ok: true,
        value: {
          type: "final",
          content: result.content,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        ok: false,
        error: new ModelError(message, this.id, error instanceof Error ? error : undefined),
      };
    }
  }

  private async generateFromMessages(
    input: OllamaGenerateInput,
    modelName?: string
  ): Promise<OllamaGenerateResult> {
    const model = await this.resolveModel(modelName);

    const prompt = this.messagesToPrompt(input.messages);
    const content = await this.client.generate(model, prompt);

    return {
      model,
      content,
    };
  }

  private messagesToPrompt(messages: OllamaMessage[]): string {
    return messages
      .map((message) => `${message.role.toUpperCase()}: ${message.content}`)
      .join("\n");
  }

  private async resolveModel(modelName?: string): Promise<string> {
    let models = this.availableModels.map((model) => model.name);

    if (models.length === 0) {
      models = await this.listModels({ refresh: true });
    }

    let resolved = modelName || this.defaultModel;

    if (!resolved) {
      resolved = await this.resolveDefaultModel(models);
      this.defaultModel = resolved;
    }

    if (!resolved) {
      throw new Error("No Ollama model configured.");
    }

    if (models.length > 0 && !models.includes(resolved)) {
      const refreshed = await this.listModels({ refresh: true });
      if (refreshed.length > 0 && !refreshed.includes(resolved)) {
        throw new Error(
          `Ollama model "${resolved}" not found. Available models: ${refreshed.join(", ")}`
        );
      }
    }

    return resolved;
  }

  private async resolveDefaultModel(models: string[]): Promise<string | undefined> {
    const explicitDefault = this.explicitDefaultModel || this.envDefaultModel;

    if (explicitDefault) {
      if (models.length === 0 || models.includes(explicitDefault)) {
        return explicitDefault;
      }
      throw new Error(
        `Configured Ollama model "${explicitDefault}" not found in available models.`
      );
    }

    const preferredDefault = "gemma-3-abliterated:latest";
    if (models.includes(preferredDefault)) {
      return preferredDefault;
    }

    const configDefault = await this.loadConfigDefaultModel();
    if (configDefault && models.includes(configDefault)) {
      return configDefault;
    }

    return models[0];
  }

  private applyAllowlist(models: string[]): string[] {
    if (!this.modelAllowlist || this.modelAllowlist.length === 0) {
      return models;
    }

    const allowSet = new Set(this.modelAllowlist);
    return models.filter((model) => allowSet.has(model));
  }

  private parseAllowlist(value: string | undefined): string[] | undefined {
    if (!value) {
      return undefined;
    }

    const items = value
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);

    return items.length > 0 ? items : undefined;
  }

  private async loadConfigDefaultModel(): Promise<string | undefined> {
    if (this.configDefaultLoaded) {
      return this.configDefaultModel;
    }

    this.configDefaultLoaded = true;

    try {
      const configPath = path.join(process.cwd(), "config", "defaultModels.json");
      const raw = await readFile(configPath, "utf-8");
      const parsed = JSON.parse(raw) as {
        providers?: {
          ollama?: {
            defaultModel?: string;
          };
        };
      };

      const defaultModel = parsed?.providers?.ollama?.defaultModel;
      if (typeof defaultModel === "string" && defaultModel.trim()) {
        this.configDefaultModel = defaultModel;
      }
    } catch {
      this.configDefaultModel = undefined;
    }

    return this.configDefaultModel;
  }
}
