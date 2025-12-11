/**
 * Base interface for all model adapters
 */

export type ModelResponse = {
  type: "final" | "tool";
  content?: string;
  tool?: string;
  arguments?: any;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
};

export interface ModelAdapter {
  generate(prompt: string, options?: ModelAdapterOptions): Promise<ModelResponse>;
  stream?(prompt: string, options?: ModelAdapterOptions): AsyncGenerator<ModelResponse>;
}

export interface ModelAdapterOptions {
  temperature?: number;
  max_tokens?: number;
  tools?: ToolSpec[];
  tool_choice?: "auto" | "none" | { type: "function"; function: { name: string } };
}

export interface ToolSpec {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: any; // JSON Schema
  };
}

