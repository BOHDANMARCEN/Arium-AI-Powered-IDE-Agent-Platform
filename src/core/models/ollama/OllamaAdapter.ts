import { EventBus } from "../../eventBus";
import { ModelAdapter, ModelInput, ModelOutput } from "../adapter";
import { ModelError } from "../../errors/standardErrors";
import { Result } from "../../utils/result";
import { OllamaClient } from "./OllamaClient";
import { OllamaGenerateInput, OllamaGenerateResult, OllamaMessage, OllamaModelInfo } from "./types";

export interface OllamaAdapterConfig {
  defaultModel?: string;
  executable?: string;
}

export class OllamaAdapter implements ModelAdapter {
  id = "ollama";
  supportsStreaming = false;
  eventBus: EventBus;
  private client: OllamaClient;
  private availableModels: OllamaModelInfo[] = [];
  private defaultModel?: string;

  constructor(eventBus: EventBus, config: OllamaAdapterConfig = {}) {
    this.eventBus = eventBus;
    this.client = new OllamaClient(config.executable);
    this.defaultModel = config.defaultModel;
  }

  async init(): Promise<void> {
    this.availableModels = await this.client.listModels();

    if (this.availableModels.length === 0) {
      throw new Error("No Ollama models available. Pull a model with `ollama pull <model>`.");
    }

    if (!this.defaultModel) {
      this.defaultModel = this.availableModels[0].name;
    }

    this.eventBus.emit("ollama.ready", { models: this.availableModels });
  }

  getAvailableModels(): OllamaModelInfo[] {
    return [...this.availableModels];
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
      messages.push(...input.context.map((content) => ({ role: "system", content })));
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
    if (this.availableModels.length === 0) {
      await this.init();
    }

    const model = modelName || this.defaultModel || this.availableModels[0]?.name;
    if (!model) {
      throw new Error("No Ollama model configured.");
    }

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
}
