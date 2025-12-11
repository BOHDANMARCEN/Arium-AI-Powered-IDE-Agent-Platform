/**
 * Ollama Model Adapter
 * Supports local LLM inference using Ollama API
 * Perfect for local-first development
 */

import { ModelAdapter, ModelResponse, ModelAdapterOptions, ToolSpec } from "./adapter";
import { ModelAdapterError } from "../errors";

export interface OllamaAdapterConfig {
  baseURL?: string; // Ollama API base URL (default: http://localhost:11434)
  model?: string; // Model name (default: llama2 or available model)
}

interface OllamaRequest {
  model: string;
  prompt: string;
  stream?: boolean;
  options?: {
    temperature?: number;
    num_predict?: number;
  };
}

interface OllamaResponse {
  model: string;
  created_at: string;
  response: string;
  done: boolean;
  context?: number[];
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
}

export class OllamaAdapter implements ModelAdapter {
  private baseURL: string;
  private model: string;

  constructor(config: OllamaAdapterConfig = {}) {
    this.baseURL = config.baseURL || process.env.OLLAMA_URL || "http://localhost:11434";
    this.model = config.model || process.env.OLLAMA_MODEL || "llama2";
  }

  /**
   * List available models from Ollama
   */
  async listModels(): Promise<string[]> {
    try {
      const response = await fetch(`${this.baseURL}/api/tags`);
      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.statusText}`);
      }
      const data = await response.json();
      return data.models?.map((m: any) => m.name) || [];
    } catch (error: any) {
      throw new Error(`Failed to list Ollama models: ${error.message}`);
    }
  }

  /**
   * Check if Ollama is available
   */
  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseURL}/api/tags`, {
        signal: AbortSignal.timeout(5000), // 5 second timeout
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async generate(prompt: string, options?: ModelAdapterOptions): Promise<ModelResponse> {
    const maxRetries = 3;
    const timeoutMs = 60000; // 60 seconds
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        // Build prompt with system message and tools if needed
        let fullPrompt = prompt;
        
        if (options?.tools && options.tools.length > 0) {
          // For Ollama, we'll include tool descriptions in the prompt
          // Note: Ollama doesn't have native function calling, so we use prompt engineering
          const toolsDescription = this.formatToolsForPrompt(options.tools);
          fullPrompt = `${toolsDescription}\n\nUser: ${prompt}\nAssistant:`;
        }

        const requestBody: OllamaRequest = {
          model: this.model,
          prompt: fullPrompt,
          stream: false,
          options: {
            temperature: options?.temperature ?? 0.7,
            num_predict: options?.max_tokens ?? 2048,
          },
        };

        // Add timeout using AbortController
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

        let response: Response;
        try {
          response = await fetch(`${this.baseURL}/api/generate`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(requestBody),
            signal: controller.signal,
          });
          clearTimeout(timeoutId);
        } catch (fetchError: any) {
          clearTimeout(timeoutId);
          throw fetchError;
        }

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Ollama API error: ${response.statusText} - ${errorText}`);
        }

        const data: OllamaResponse = await response.json();

        // Parse response for tool calls (simple heuristic-based parsing)
        if (options?.tools && options.tools.length > 0) {
          const toolCall = this.parseToolCall(data.response, options.tools);
          if (toolCall) {
            return {
              type: "tool",
              tool: toolCall.tool,
              arguments: toolCall.arguments,
              usage: {
                prompt_tokens: data.prompt_eval_count,
                completion_tokens: data.eval_count,
                total_tokens: (data.prompt_eval_count || 0) + (data.eval_count || 0),
              },
            };
          }
        }

        return {
          type: "final",
          content: data.response,
          usage: {
            prompt_tokens: data.prompt_eval_count,
            completion_tokens: data.eval_count,
            total_tokens: (data.prompt_eval_count || 0) + (data.eval_count || 0),
          },
        };
      } catch (error: any) {
        lastError = error;

        // Check if error is retryable
        const isRetryable =
          error.message?.includes("fetch failed") ||
          error.message?.includes("timeout") ||
          error.message?.includes("ECONNREFUSED") ||
          error.message?.includes("ETIMEDOUT") ||
          error.message?.includes("500") ||
          error.message?.includes("503") ||
          error.name === "AbortError";

        if (isRetryable && attempt < maxRetries - 1) {
          // Exponential backoff
          const delay = Math.pow(2, attempt) * 1000;
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue; // Retry
        }

        throw new ModelAdapterError(error.message || "Unknown error", "ollama", error);
      }
    }

    throw new ModelAdapterError(
      lastError?.message || "Unknown error after retries",
      "ollama",
      lastError || undefined
    );
  }

  async *stream(
    prompt: string,
    options?: ModelAdapterOptions
  ): AsyncGenerator<ModelResponse> {
    try {
      let fullPrompt = prompt;
      
      if (options?.tools && options.tools.length > 0) {
        const toolsDescription = this.formatToolsForPrompt(options.tools);
        fullPrompt = `${toolsDescription}\n\nUser: ${prompt}\nAssistant:`;
      }

      const requestBody: OllamaRequest = {
        model: this.model,
        prompt: fullPrompt,
        stream: true,
        options: {
          temperature: options?.temperature ?? 0.7,
          num_predict: options?.max_tokens ?? 2048,
        },
      };

      const response = await fetch(`${this.baseURL}/api/generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.statusText}`);
      }

      if (!response.body) {
        throw new Error("No response body from Ollama");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let accumulatedContent = "";

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split("\n").filter((line) => line.trim());

          for (const line of lines) {
            try {
              const data: OllamaResponse = JSON.parse(line);
              
              if (data.response) {
                accumulatedContent += data.response;
                yield {
                  type: "final",
                  content: accumulatedContent,
                };
              }

              if (data.done) {
                return;
              }
            } catch (e) {
              // Skip invalid JSON lines
            }
          }
        }
      } finally {
        reader.releaseLock();
      }
    } catch (error: any) {
      throw new Error(`Ollama streaming error: ${error.message}`);
    }
  }

  /**
   * Format tools for prompt engineering (since Ollama doesn't have native function calling)
   */
  private formatToolsForPrompt(tools: ToolSpec[]): string {
    let prompt = "Available tools:\n";
    for (const tool of tools) {
      prompt += `- ${tool.function.name}: ${tool.function.description || "No description"}\n`;
      if (tool.function.parameters) {
        prompt += `  Parameters: ${JSON.stringify(tool.function.parameters, null, 2)}\n`;
      }
    }
    prompt += "\nTo call a tool, respond with: CALL_TOOL: <tool_name> <json_arguments>\n";
    prompt += "Example: CALL_TOOL: fs.read {\"path\": \"file.txt\"}";
    return prompt;
  }

  /**
   * Parse tool call from response (heuristic-based)
   */
  private parseToolCall(response: string, tools: ToolSpec[]): { tool: string; arguments: any } | null {
    // Look for CALL_TOOL pattern
    const callPattern = /CALL_TOOL:\s*(\w+)\s+(\{.*?\})/s;
    const match = response.match(callPattern);
    
    if (match) {
      const toolName = match[1];
      const argsStr = match[2];
      
      // Verify tool exists
      const tool = tools.find((t) => t.function.name === toolName);
      if (!tool) {
        return null;
      }

      try {
        const arguments_ = JSON.parse(argsStr);
        return { tool: toolName, arguments: arguments_ };
      } catch {
        return null;
      }
    }

    return null;
  }
}

