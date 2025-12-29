import { EventBus } from '../../eventBus';
import { OllamaClient } from './OllamaClient';
import { OllamaGenerateInput, OllamaGenerateResult, OllamaModelInfo } from './types';

/**
 * A model adapter for interacting with local Ollama models.
 * It follows a simplified API tailored for Ollama's capabilities
 * and does not conform to the more complex ModelAdapter interface.
 */
export class OllamaAdapter {
  private client: OllamaClient;
  private availableModels: OllamaModelInfo[] = [];

  constructor(public eventBus: EventBus) {
    this.client = new OllamaClient();
  }

  /**
   * Initializes the adapter by detecting available Ollama models.
   * Emits an 'ollama.ready' event with the list of available models.
   */
  public async init(): Promise<void> {
    try {
      this.availableModels = await this.client.listModels();
      this.eventBus.emit('ollama.ready', { models: this.availableModels });
    } catch (error) {
      console.error('Failed to initialize OllamaAdapter:', error);
      // We don't rethrow here, as the application might be able to run
      // without Ollama, but we log the failure.
    }
  }

  /**
   * Generates a response from an Ollama model.
   *
   * @param input - The input for the model, including messages and an optional model name.
   * @returns A promise that resolves to the generation result.
   * @throws An error if no models are available or the specified model is not found.
   */
  public async generate(input: OllamaGenerateInput): Promise<OllamaGenerateResult> {
    if (this.availableModels.length === 0) {
      throw new Error('No Ollama models available. Cannot generate response.');
    }

    const modelName = input.model || this.availableModels[0].name;

    const modelExists = this.availableModels.some(m => m.name === modelName);
    if (!modelExists) {
      throw new Error(`Model '${modelName}' is not available. Available models: ${this.availableModels.map(m => m.name).join(', ')}`);
    }

    // Convert message history to a single prompt string.
    // This is a simplified approach. A more sophisticated implementation
    // would format this based on the specific model's chat template.
    const prompt = input.messages.map(m => `[${m.role}] ${m.content}`).join('\n');

    const content = await this.client.generate(modelName, prompt);

    return { content };
  }
}
