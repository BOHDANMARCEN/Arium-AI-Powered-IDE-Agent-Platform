export type OllamaRole = "system" | "user" | "assistant";

export interface OllamaMessage {
  role: OllamaRole;
  content: string;
}

export interface OllamaModelInfo {
  name: string;
}

export interface OllamaTagModel {
  name?: string;
  model?: string;
  modified_at?: string;
  size?: number;
  digest?: string;
  details?: Record<string, unknown>;
}

export interface OllamaTagsResponse {
  models?: OllamaTagModel[];
}

export interface OllamaGenerateInput {
  messages: OllamaMessage[];
  temperature?: number;
}

export interface OllamaGenerateResult {
  model: string;
  content: string;
}
