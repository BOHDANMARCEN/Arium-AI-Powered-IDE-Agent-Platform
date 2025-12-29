export interface OllamaModelInfo {
  name: string;
  modified_at: string;
  size: number;
}

export interface OllamaGenerateInput {
  model?: string;
  messages: {
    role: 'user' | 'assistant' | 'system';
    content: string;
  }[];
  temperature?: number;
}

export interface OllamaGenerateResult {
  content: string;
}
