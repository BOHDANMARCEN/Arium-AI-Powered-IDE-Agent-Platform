/**
 * Mock model adapter for local dev.
 * Conforms to the new ModelAdapter interface.
 */
import {
  BaseModelAdapter,
  ModelAdapterConfig,
  ModelInput,
  ModelOutput,
} from "./adapter";
import { EventBus } from "../eventBus";

export class MockAdapter extends BaseModelAdapter {
  id: string = "mock-adapter";
  supportsStreaming: boolean = false;

  constructor(eventBus: EventBus, config?: ModelAdapterConfig) {
    super(eventBus, config);
  }

  protected async generateOnce(input: ModelInput): Promise<ModelOutput> {
    const { prompt } = input;

    // Trivial heuristics: if prompt contains keywords, return a tool call
    if (prompt.includes("CALL: fs.read")) {
      return {
        type: "tool",
        tool: "fs.read",
        arguments: { path: "src/main.ts" },
      };
    }
    if (prompt.includes("CALL: fs.write")) {
      return {
        type: "tool",
        tool: "fs.write",
        arguments: { path: "src/main.ts", content: "// updated by agent\n" },
      };
    }

    return { type: "final", content: "Mock response: no tool call." };
  }
}

