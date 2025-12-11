import { OllamaAdapter } from "./ollamaAdapter";
import config from "../../config/defaultModels.json";

export class ModelManager {
  private adapters: Record<string, any> = {};

  constructor() {
    const ollamaCfg = config.providers.ollama;

    this.adapters.ollama = new OllamaAdapter({
      model: ollamaCfg.defaultModel,
      baseURL: process.env.OLLAMA_URL || "http://localhost:11434"
    });
  }

  getDefault(provider = "ollama") {
    return this.adapters[provider];
  }

  async setDefaultModel(provider: string, modelName: string) {
    if (provider === "ollama") {
      this.adapters.ollama = new OllamaAdapter({
        model: modelName,
        baseURL: process.env.OLLAMA_URL || "http://localhost:11434"
      });
      config.providers.ollama.defaultModel = modelName;
    }
  }

  async listAvailableModels(provider = "ollama") {
    if (provider === "ollama") {
      return this.adapters.ollama.listModels();
    }
    return [];
  }
}