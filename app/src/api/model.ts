const API = process.env.REACT_APP_API_URL || 'http://localhost:4000';

export interface CompletionRequest {
  path: string;
  code: string;
  position: { line: number; column: number };
  language?: string;
}

export interface CompletionSuggestion {
  label: string;
  insertText: string;
  detail?: string;
  kind?: string;
}

export interface CompletionResponse {
  suggestions: CompletionSuggestion[];
}

export async function requestCompletion(context: CompletionRequest): Promise<CompletionResponse> {
  const res = await fetch(`${API}/models/complete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(context),
  });

  if (!res.ok) {
    throw new Error(`Completion request failed: ${res.status}`);
  }

  return res.json();
}
