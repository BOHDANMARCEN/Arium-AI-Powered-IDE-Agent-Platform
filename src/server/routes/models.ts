import { Router, Request, Response } from "express";
import { ModelCompleteSchema } from "./schemas";
import { validateBody } from "../middleware/validation";
import { ValidationError } from "../../core/errors";
import { ModelManager } from "../../core/models/modelManager";

export function modelsRoutes(modelManager: ModelManager) {
  const r = Router();

  // AI code completion endpoint
  r.post("/complete", validateBody(ModelCompleteSchema), async (req: Request, res: Response) => {
    try {
      // Get validated data from middleware
      const validatedBody = (req as any).validatedBody;
      if (!validatedBody) {
        return res.status(400).json({
          ok: false,
          error: { code: "validation_error", message: "Missing validated body" },
        });
      }

      const { path, code, position, language } = validatedBody;

      // Get the default model adapter
      const adapter = modelManager.getDefault();

      // Create completion prompt
      const prompt = buildCompletionPrompt(code, position, language || 'typescript', path);

      // Generate completion using the model
      const response = await adapter.generate(prompt, {
        temperature: 0.1, // Low temperature for code completion
        max_tokens: 100, // Short completions
      });

      if (!response.ok) {
        return res.status(500).json({
          ok: false,
          error: { code: "model_error", message: response.error.message },
        });
      }

      // Parse the completion response into suggestions
      const suggestions = parseCompletionResponse(response.value.content || '');

      res.json({
        ok: true,
        suggestions
      });
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      if (error instanceof ValidationError) {
        return res.status(400).json({
          ok: false,
          error: {
            code: "validation_error",
            message: err.message,
            details: error instanceof ValidationError ? error.details : undefined
          }
        });
      }
      res.status(500).json({
        ok: false,
        error: {
          code: "internal_error",
          message: err.message || "Internal server error"
        }
      });
    }
  });

  return r;
}

function buildCompletionPrompt(code: string, position: { line: number; column: number }, language: string, path?: string): string {
  // Get the code up to the cursor position
  const lines = code.split('\n');
  const prefix = lines.slice(0, position.line + 1).join('\n');
  const currentLine = lines[position.line] || '';
  const linePrefix = currentLine.substring(0, position.column);

  // Create a focused prompt for code completion
  const prompt = `Complete the following ${language} code. Provide only the completion text, no explanations.

Code so far:
${prefix}

Current line: ${linePrefix}

Completion:`;

  return prompt;
}

function parseCompletionResponse(response: string): Array<{
  label: string;
  insertText: string;
  detail?: string;
  kind: string;
}> {
  // Clean up the response
  const cleaned = response.trim();

  if (!cleaned) {
    return [];
  }

  // Split by common separators for multiple suggestions
  const suggestions = cleaned.split(/[;\n,]/).map(s => s.trim()).filter(s => s.length > 0);

  return suggestions.slice(0, 10).map((suggestion, index) => ({
    label: suggestion,
    insertText: suggestion,
    detail: `Suggestion ${index + 1}`,
    kind: 'text'
  }));
}
