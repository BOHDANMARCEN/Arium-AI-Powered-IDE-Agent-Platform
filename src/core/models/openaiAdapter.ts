/**
 * OpenAI Model Adapter
 * Conforms to the new Arium 0.2.0 ModelAdapter interface.
 * Supports GPT-4, GPT-4o, GPT-4o-mini with tool calling.
 */

import OpenAI from "openai";
import {
  BaseModelAdapter,
  ModelAdapterConfig,
  ModelInput,
  ModelOutput,
  ModelChunk,
  ToolSpec,
} from "./adapter";
import { ModelError } from "../errors/standardErrors";
import { EventBus } from "../eventBus";

export interface OpenAIAdapterConfig extends ModelAdapterConfig {
  apiKey: string;
  model?: string;
  baseURL?: string;
}

export class OpenAIAdapter extends BaseModelAdapter {
  id: string = "openai";
  supportsStreaming: boolean = true;
  private client: OpenAI;
  private model: string;

  constructor(config: OpenAIAdapterConfig, eventBus: EventBus) {
    super(eventBus, config);
    if (!config.apiKey) {
      throw new Error("OpenAI API key is required");
    }

    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL,
    });

    this.model = config.model || "gpt-4o-mini";
  }

  protected async generateOnce(input: ModelInput): Promise<ModelOutput> {
    const { prompt, context, options } = input;

    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];
    if (context) {
      messages.push(...context.map(c => ({ role: "system" as const, content: c })));
    }
    messages.push({ role: "user", content: prompt });

    const tools = this.formatTools(options?.tools);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      const response = await this.client.chat.completions.create(
        {
          model: this.model,
          messages,
          tools,
          tool_choice: options?.tool_choice || "auto",
          temperature: options?.temperature ?? 0.0,
          max_tokens: options?.max_tokens ?? 2048,
        },
        { signal: controller.signal }
      );

      clearTimeout(timeoutId);

      const choice = response.choices[0];
      if (!choice) {
        throw new Error("No response choice from OpenAI");
      }

      // Handle tool calls
      if (choice.message.tool_calls && choice.message.tool_calls.length > 0) {
        const toolCall = choice.message.tool_calls[0];
        try {
          const parsedArgs = JSON.parse(toolCall.function.arguments || "{}");
          return {
            type: "tool",
            tool: toolCall.function.name,
            arguments: parsedArgs,
            usage: response.usage,
          };
        } catch (parseError) {
          // Fallback for malformed JSON from the model
          return {
            type: "tool",
            tool: toolCall.function.name,
            arguments: {}, // Return empty object on parse failure
            usage: response.usage,
          };
        }
      }

      // Handle final answer
      return {
        type: "final",
        content: choice.message.content || "",
        usage: response.usage,
      };
    } catch (e: unknown) {
        clearTimeout(timeoutId);
        // Let the base class handle the error via its retry mechanism
        throw e;
    }
  }

  async *stream(input: ModelInput): AsyncGenerator<ModelChunk, void, unknown> {
    const { prompt, context, options } = input;
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];
    if (context) {
        messages.push(...context.map(c => ({ role: "system" as const, content: c })));
    }
    messages.push({ role: "user", content: prompt });
    const tools = this.formatTools(options?.tools);

    const stream = await this.client.chat.completions.create({
        model: this.model,
        messages,
        tools,
        tool_choice: options?.tool_choice || "auto",
        temperature: options?.temperature ?? 0.0,
        max_tokens: options?.max_tokens ?? 2048,
        stream: true,
    });

    for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta;
        if (delta?.content) {
            yield { content: delta.content };
        }
    }
  }

  protected handleError(error: unknown): ModelError {
    if (error instanceof OpenAI.APIError) {
        const code = this.shouldRetry(error) ? "transient" : "fatal";
        return new ModelError(error.message, this.id, error, code);
    }
    if (error instanceof Error) {
        return new ModelError(error.message, this.id, error, this.shouldRetry(error) ? "transient" : "fatal");
    }
    return new ModelError("Unknown OpenAI error", this.id, undefined, "fatal");
  }

  protected shouldRetry(error: Error): boolean {
    if (error instanceof OpenAI.RateLimitError) return true;
    if (error instanceof OpenAI.InternalServerError) return true;
    if (error instanceof OpenAI.ConflictError) return true; // e.g. 409
    if (error.message.includes("timeout")) return true;
    return false;
  }
  
  private formatTools(tools: ToolSpec[] | undefined): OpenAI.Chat.Completions.ChatCompletionTool[] | undefined {
      if (!tools) return undefined;
      return tools.map(tool => ({
          type: "function",
          function: {
              name: tool.function.name,
              description: tool.function.description,
              parameters: tool.function.parameters || {},
          }
      }));
  }
}

