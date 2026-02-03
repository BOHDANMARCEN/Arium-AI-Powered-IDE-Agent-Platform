import { execFile } from "child_process";
import { promisify } from "util";
import { OllamaTagsResponse } from "./types";

const execFileAsync = promisify(execFile);

export interface OllamaClientOptions {
  baseURL?: string;
  executable?: string;
  cacheTtlMs?: number;
}

export class OllamaClient {
  private executable: string;
  private baseURL: string;
  private cacheTtlMs: number;
  private cachedModels: string[] | null = null;
  private cacheExpiresAt = 0;

  constructor(options: OllamaClientOptions | string = {}) {
    if (typeof options === "string") {
      this.executable = options || "ollama";
      this.baseURL = "http://localhost:11434";
      this.cacheTtlMs = 30000;
    } else {
      this.executable = options.executable || "ollama";
      this.baseURL = options.baseURL || "http://localhost:11434";
      this.cacheTtlMs = options.cacheTtlMs ?? 30000;
    }
  }

  async listModels(options: { refresh?: boolean } = {}): Promise<string[]> {
    const refresh = options.refresh ?? false;
    const now = Date.now();

    if (!refresh && this.cachedModels && now < this.cacheExpiresAt) {
      return [...this.cachedModels];
    }

    let models: string[] = [];

    try {
      models = await this.listModelsViaHttp();
    } catch (error) {
      models = await this.listModelsViaCli();
    }

    this.cachedModels = models;
    this.cacheExpiresAt = now + this.cacheTtlMs;

    return [...models];
  }

  async generate(model: string, prompt: string): Promise<string> {
    try {
      const { stdout } = await execFileAsync(
        this.executable,
        ["run", model, prompt],
        {
          maxBuffer: 10 * 1024 * 1024,
        }
      );

      return stdout.trim();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to generate response from Ollama: ${message}`);
    }
  }

  private async listModelsViaHttp(): Promise<string[]> {
    const response = await fetch(`${this.baseURL}/api/tags`, {
      method: "GET",
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      throw new Error(`Ollama API returned ${response.status}`);
    }

    const data = (await response.json()) as OllamaTagsResponse;
    return this.extractModelNames(data);
  }

  private extractModelNames(data: OllamaTagsResponse): string[] {
    const models = Array.isArray(data?.models) ? data.models : [];
    const names: string[] = [];

    for (const model of models) {
      const name =
        typeof model?.name === "string"
          ? model.name
          : typeof model?.model === "string"
          ? model.model
          : "";

      if (name) {
        names.push(name);
      }
    }

    return Array.from(new Set(names));
  }

  private async listModelsViaCli(): Promise<string[]> {
    try {
      const { stdout } = await execFileAsync(this.executable, ["list"], {
        maxBuffer: 1024 * 1024,
      });

      const lines = stdout
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);

      if (lines.length === 0) {
        return [];
      }

      const rows = lines.slice(1);
      const models = rows
        .map((line) => line.split(/\s+/)[0])
        .filter((name) => Boolean(name) && name !== "NAME");

      return Array.from(new Set(models));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to list Ollama models: ${message}`);
    }
  }
}
