import { EventBus } from "../../../eventBus";
import { OllamaAdapter } from "../OllamaAdapter";
import { OllamaClient } from "../OllamaClient";

const mockFetchResponse = (models: Array<{ name?: string; model?: string }>) => {
  return {
    ok: true,
    json: async () => ({ models }),
  } as any;
};

describe("Ollama discovery", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = jest.fn();
    delete process.env.OLLAMA_MODEL_ALLOWLIST;
    delete process.env.OLLAMA_MODEL;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  test("parses namespaced and tagged models from /api/tags", async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      mockFetchResponse([
        { name: "huihui_ai/qwen2.5-1m-abliterated:14b" },
        { name: "gemma-3-abliterated:latest" },
        { name: "gemini-3-flash-preview:cloud" },
      ])
    );

    const client = new OllamaClient({ baseURL: "http://localhost:11434", cacheTtlMs: 0 });
    const models = await client.listModels({ refresh: true });

    expect(models).toEqual([
      "huihui_ai/qwen2.5-1m-abliterated:14b",
      "gemma-3-abliterated:latest",
      "gemini-3-flash-preview:cloud",
    ]);
  });

  test("prefers gemma-3-abliterated:latest when available", async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      mockFetchResponse([
        { name: "llama3.2:3b" },
        { name: "gemma-3-abliterated:latest" },
        { name: "qwen3-coder:480b-cloud" },
      ])
    );

    jest.spyOn(OllamaClient.prototype, "generate").mockResolvedValue("ok");

    const adapter = new OllamaAdapter(new EventBus(), {
      baseURL: "http://localhost:11434",
    });

    await adapter.init();

    const result = await adapter.generate({
      messages: [{ role: "user", content: "hello" }],
    });

    expect(result.model).toBe("gemma-3-abliterated:latest");
  });

  test("applies allowlist only when provided", async () => {
    const modelsResponse = [
      { name: "gemma-3-abliterated:latest" },
      { name: "llama3.2:3b" },
      { name: "qwen3-coder:480b-cloud" },
    ];

    (global.fetch as jest.Mock).mockResolvedValue(mockFetchResponse(modelsResponse));

    const adapter = new OllamaAdapter(new EventBus(), {
      baseURL: "http://localhost:11434",
    });

    const allModels = await adapter.listModels({ refresh: true });
    expect(allModels).toEqual([
      "gemma-3-abliterated:latest",
      "llama3.2:3b",
      "qwen3-coder:480b-cloud",
    ]);

    process.env.OLLAMA_MODEL_ALLOWLIST = "gemma-3-abliterated:latest,llama3.2:3b";
    (global.fetch as jest.Mock).mockResolvedValue(mockFetchResponse(modelsResponse));

    const filteredAdapter = new OllamaAdapter(new EventBus(), {
      baseURL: "http://localhost:11434",
    });

    const filteredModels = await filteredAdapter.listModels({ refresh: true });
    expect(filteredModels).toEqual(["gemma-3-abliterated:latest", "llama3.2:3b"]);
  });
});
