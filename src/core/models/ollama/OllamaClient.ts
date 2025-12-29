import { execFile } from 'child_process';
import { promisify } from 'util';
import { OllamaModelInfo } from './types';

const execFileAsync = promisify(execFile);

// A simple, dependency-free Ollama client that uses child_process to interact
// with the `ollama` command-line tool.
export class OllamaClient {
  private readonly executable = 'ollama';

  /**
   * Checks if the 'ollama' command is available.
   * @throws An error if the 'ollama' command is not found.
   */
  private async checkOllamaAvailability() {
    try {
      // Use a lightweight command like '--version' to check for presence.
      await execFileAsync(this.executable, ['--version']);
    } catch (error) {
      console.error('Ollama executable not found. Please ensure Ollama is installed and in your PATH.');
      throw new Error('Ollama is not installed or not in PATH.');
    }
  }

  /**
   * Lists the models available locally via the `ollama list` command.
   * @returns A promise that resolves to an array of OllamaModelInfo objects.
   */
  public async listModels(): Promise<OllamaModelInfo[]> {
    await this.checkOllamaAvailability();
    try {
      const { stdout } = await execFileAsync(this.executable, ['list']);
      const lines = stdout.trim().split('\n').slice(1); // Skip header line
      
      if (lines.length === 0) {
        return [];
      }

      return lines.map(line => {
        const parts = line.split(/\s+/);
        return {
          name: parts[0],
          modified_at: parts[2], // Assuming ID and SIZE are before MODIFIED
          size: 0, // Size parsing is complex, return 0 for now
        };
      });
    } catch (error) {
      console.error('Failed to execute `ollama list`:', error);
      throw new Error('Could not list Ollama models. Is Ollama running?');
    }
  }

  /**
   * Generates a response from a model.
   * @param model - The name of the model to use.
   * @param prompt - The prompt to send to the model.
   * @returns A promise that resolves to the generated content.
   */
  public async generate(model: string, prompt: string): Promise<string> {
    await this.checkOllamaAvailability();
    try {
      const { stdout } = await execFileAsync(this.executable, ['run', model, prompt]);
      return stdout.trim();
    } catch (error) {
      console.error(`Failed to execute 	esteollama run ${model}	este:`, error);
      throw new Error(`Failed to generate response from model ${model}.`);
    }
  }
}
