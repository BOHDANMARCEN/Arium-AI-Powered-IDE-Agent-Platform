import { execFile } from "child_process";
import { promisify } from "util";
import { OllamaModelInfo } from "./types";

const execFileAsync = promisify(execFile);

export class OllamaClient {
  constructor(private executable: string = "ollama") {}

  async listModels(): Promise<OllamaModelInfo[]> {
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
        .filter((name) => Boolean(name) && name !== "NAME")
        .map((name) => ({ name }));

      return models;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to list Ollama models: ${message}`);
    }
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
}
