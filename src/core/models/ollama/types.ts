export type OllamaRole = "system" | "user" | "assistant";

export interface OllamaMessage {
  role: OllamaRole;
  content: string;
}

export interface OllamaModelInfo {
  name: string;
}

export interface OllamaGenerateInput {
  messages: OllamaMessage[];
  temperature?: number;
}

export interface OllamaGenerateResult {
  model: string;
  content: string;
}
