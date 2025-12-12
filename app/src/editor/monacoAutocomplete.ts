import * as monaco from 'monaco-editor';
import { requestCompletion, CompletionRequest, CompletionSuggestion } from '../api/model';

export function registerAiAutocomplete(getEditorState: () => { path: string; code: string }) {
  let debounceTimer: NodeJS.Timeout | null = null;

  monaco.languages.registerCompletionItemProvider('typescript', {
    triggerCharacters: ['.', '"', "'", '/', ' ', '\n'],
    provideCompletionItems: async (model, position): Promise<monaco.languages.CompletionList> => {
      // Clear previous debounce
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }

      return new Promise((resolve) => {
        debounceTimer = setTimeout(async () => {
          try {
            const state = getEditorState();
            const code = model.getValue();

            const request: CompletionRequest = {
              path: state.path,
              code,
              position: { line: position.lineNumber, column: position.column },
              language: 'typescript'
            };

            const resp = await requestCompletion(request);
            const suggestions = resp.suggestions || [];

            const completionItems: monaco.languages.CompletionItem[] = suggestions.map((s: CompletionSuggestion) => ({
              label: s.label,
              kind: mapCompletionKind(s.kind),
              insertText: s.insertText,
              detail: s.detail,
              range: undefined // Use default range
            }));

            resolve({ suggestions: completionItems });
          } catch (error) {
            console.warn('AI completion failed:', error);
            resolve({ suggestions: [] });
          }
        }, 300); // 300ms debounce
      });
    }
  });

  // Also register for JavaScript
  monaco.languages.registerCompletionItemProvider('javascript', {
    triggerCharacters: ['.', '"', "'", '/', ' ', '\n'],
    provideCompletionItems: async (model, position): Promise<monaco.languages.CompletionList> => {
      // Same logic as above, but for JavaScript
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }

      return new Promise((resolve) => {
        debounceTimer = setTimeout(async () => {
          try {
            const state = getEditorState();
            const code = model.getValue();

            const request: CompletionRequest = {
              path: state.path,
              code,
              position: { line: position.lineNumber, column: position.column },
              language: 'javascript'
            };

            const resp = await requestCompletion(request);
            const suggestions = resp.suggestions || [];

            const completionItems: monaco.languages.CompletionItem[] = suggestions.map((s: CompletionSuggestion) => ({
              label: s.label,
              kind: mapCompletionKind(s.kind),
              insertText: s.insertText,
              detail: s.detail,
              range: undefined
            }));

            resolve({ suggestions: completionItems });
          } catch (error) {
            console.warn('AI completion failed:', error);
            resolve({ suggestions: [] });
          }
        }, 300);
      });
    }
  });
}

function mapCompletionKind(kind?: string): monaco.languages.CompletionItemKind {
  switch (kind?.toLowerCase()) {
    case 'method': return monaco.languages.CompletionItemKind.Method;
    case 'function': return monaco.languages.CompletionItemKind.Function;
    case 'variable': return monaco.languages.CompletionItemKind.Variable;
    case 'class': return monaco.languages.CompletionItemKind.Class;
    case 'interface': return monaco.languages.CompletionItemKind.Interface;
    case 'property': return monaco.languages.CompletionItemKind.Property;
    case 'snippet': return monaco.languages.CompletionItemKind.Snippet;
    default: return monaco.languages.CompletionItemKind.Text;
  }
}
