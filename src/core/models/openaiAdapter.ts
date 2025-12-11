/**
 * OpenAI Model Adapter
 * Supports GPT-4, GPT-4o, GPT-4o-mini with tool calling
 */

import OpenAI from "openai";
import { ModelAdapter, ModelResponse, ModelAdapterOptions, ToolSpec } from "./adapter";
import { ModelAdapterError } from "../errors";

export interface OpenAIAdapterConfig {
  apiKey: string;
  model?: string;
  baseURL?: string;
}

export class OpenAIAdapter implements ModelAdapter {
  private client: OpenAI;
  private defaultModel: string;

  constructor(config: OpenAIAdapterConfig) {
    if (!config.apiKey) {
      throw new Error("OpenAI API key is required");
    }

    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL,
    });

    this.defaultModel = config.model || "gpt-4o-mini";
  }

  async generate(prompt: string, options?: ModelAdapterOptions): Promise<ModelResponse> {
    const maxRetries = 3;
    const timeoutMs = 60000; // 60 seconds
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        // Build messages array
        const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
          {
            role: "user",
            content: prompt,
          },
        ];

        // Convert tools to OpenAI format if provided
        const tools = options?.tools
          ? options.tools.map((tool) => ({
              type: "function" as const,
              function: {
                name: tool.function.name,
                description: tool.function.description,
                parameters: tool.function.parameters || {},
              },
            }))
          : undefined;

        // Add timeout using AbortController
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

        try {
          const response = await this.client.chat.completions.create(
            {
              model: this.defaultModel,
              messages,
              tools,
              tool_choice: options?.tool_choice || "auto",
              temperature: options?.temperature ?? 0.0,
              max_tokens: options?.max_tokens ?? 2048,
            },
            {
              signal: controller.signal as any,
            }
          );

          clearTimeout(timeoutId);

          const choice = response.choices[0];
          if (!choice) {
            throw new Error("No response from OpenAI");
          }

          // Handle tool calls
          if (choice.message.tool_calls && choice.message.tool_calls.length > 0) {
            const toolCall = choice.message.tool_calls[0];
            return {
              type: "tool",
              tool: toolCall.function.name,
              arguments: JSON.parse(toolCall.function.arguments || "{}"),
              usage: {
                prompt_tokens: response.usage?.prompt_tokens,
                completion_tokens: response.usage?.completion_tokens,
                total_tokens: response.usage?.total_tokens,
              },
            };
          }

          // Handle final answer
          const content = choice.message.content || "";
          return {
            type: "final",
            content,
            usage: {
              prompt_tokens: response.usage?.prompt_tokens,
              completion_tokens: response.usage?.completion_tokens,
              total_tokens: response.usage?.total_tokens,
            },
          };
        } catch (fetchError: any) {
          clearTimeout(timeoutId);
          throw fetchError;
        }
      } catch (error: any) {
        lastError = error;

        // Check if error is retryable
        const isRetryable =
          error.message?.includes("429") || // Rate limit
          error.message?.includes("500") || // Server error
          error.message?.includes("503") || // Service unavailable
          error.message?.includes("timeout") ||
          error.message?.includes("ECONNRESET") ||
          error.message?.includes("ETIMEDOUT") ||
          error.name === "AbortError";

        if (isRetryable && attempt < maxRetries - 1) {
          // Exponential backoff
          const delay = Math.pow(2, attempt) * 1000;
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue; // Retry
        }

        throw new ModelAdapterError(error.message || "Unknown error", "openai", error);
      }
    }

    throw new ModelAdapterError(
      lastError?.message || "Unknown error after retries",
      "openai",
      lastError || undefined
    );
  }

  async *stream(
    prompt: string,
    options?: ModelAdapterOptions
  ): AsyncGenerator<ModelResponse> {
    try {
      const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
        {
          role: "user",
          content: prompt,
        },
      ];

      const tools = options?.tools
        ? options.tools.map((tool) => ({
            type: "function" as const,
            function: {
              name: tool.function.name,
              description: tool.function.description,
              parameters: tool.function.parameters || {},
            },
          }))
        : undefined;

      const stream = await this.client.chat.completions.create({
        model: this.defaultModel,
        messages,
        tools,
        tool_choice: options?.tool_choice || "auto",
        temperature: options?.temperature ?? 0.0,
        max_tokens: options?.max_tokens ?? 2048,
        stream: true,
      });

      let accumulatedContent = "";
      let toolCallName: string | null = null;
      let toolCallArguments = "";

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta;
        if (!delta) continue;

        // Handle tool calls
        if (delta.tool_calls && delta.tool_calls.length > 0) {
          const toolCall = delta.tool_calls[0];
          if (toolCall.function?.name) {
            toolCallName = toolCall.function.name;
          }
          if (toolCall.function?.arguments) {
            toolCallArguments += toolCall.function.arguments;
          }

          if (toolCallName && toolCallArguments) {
            yield {
              type: "tool",
              tool: toolCallName,
              arguments: JSON.parse(toolCallArguments),
            };
          }
        }

        // Handle text content
        if (delta.content) {
          accumulatedContent += delta.content;
          yield {
            type: "final",
            content: accumulatedContent,
          };
        }
      }
    } catch (error: any) {
      throw new Error(`OpenAI streaming error: ${error.message}`);
    }
  }
}

