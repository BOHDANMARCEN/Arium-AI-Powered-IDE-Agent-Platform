/**
 * Mock model adapter for local dev.
 * - when prompt asks for tool call, returns a structured object
 * - otherwise returns text
 *
 * Replace with real adapters (OpenAI, Ollama) later.
 */

import { ModelAdapter, ModelResponse, ModelAdapterOptions } from "./adapter";

export class MockAdapter implements ModelAdapter {
  async generate(prompt: string, options?: ModelAdapterOptions): Promise<ModelResponse> {
    // trivial heuristics: if prompt contains "read:" then call fs.read
    if (prompt.includes("CALL: fs.read")) {
      return {
        type: "tool",
        tool: "fs.read",
        arguments: { path: "src/main.ts" }
      };
    }
    if (prompt.includes("CALL: fs.write")) {
      return {
        type: "tool",
        tool: "fs.write",
        arguments: { path: "src/main.ts", content: "// updated by agent\n" }
      };
    }
    return { type: "final", content: "Mock response: no tool call." };
  }
}

