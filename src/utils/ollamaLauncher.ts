/**
 * Ollama Launcher Utility
 * Checks if Ollama is running and optionally starts it
 */

import { spawn, exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export interface OllamaLauncherConfig {
  baseURL?: string;
  autoStart?: boolean;
  checkInterval?: number; // ms
  maxWaitTime?: number; // ms
}

export class OllamaLauncher {
  private baseURL: string;
  private autoStart: boolean;
  private checkInterval: number;
  private maxWaitTime: number;
  private ollamaProcess: any = null;

  constructor(config: OllamaLauncherConfig = {}) {
    this.baseURL = config.baseURL || "http://localhost:11434";
    this.autoStart = config.autoStart ?? true;
    this.checkInterval = config.checkInterval || 2000; // 2 seconds
    this.maxWaitTime = config.maxWaitTime || 30000; // 30 seconds
  }

  /**
   * Check if Ollama is running
   */
  async isRunning(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseURL}/api/tags`, {
        method: "GET",
        signal: AbortSignal.timeout(3000), // 3 second timeout
      });
      return response.ok;
    } catch (error) {
      return false;
    }
  }

  /**
   * Start Ollama server
   */
  async start(): Promise<void> {
    if (await this.isRunning()) {
      console.log("✅ Ollama is already running");
      return;
    }

    console.log("🚀 Starting Ollama server...");

    try {
      // Try to start Ollama
      // On Windows, 'ollama serve' should work if Ollama is in PATH
      const isWindows = process.platform === "win32";
      
      if (isWindows) {
        // On Windows, try to start Ollama in background
        // Note: This might require Ollama to be installed and in PATH
        this.ollamaProcess = spawn("ollama", ["serve"], {
          detached: true,
          stdio: "ignore",
          shell: true,
        });

        this.ollamaProcess.unref(); // Allow parent process to exit independently

        // Wait for Ollama to start
        await this.waitForOllama();
      } else {
        // Unix-like systems
        this.ollamaProcess = spawn("ollama", ["serve"], {
          detached: true,
          stdio: "ignore",
        });

        this.ollamaProcess.unref();
        await this.waitForOllama();
      }
    } catch (error: any) {
      console.error("❌ Failed to start Ollama:", error.message);
      console.log("💡 Make sure Ollama is installed and in your PATH");
      console.log("   Install from: https://ollama.ai");
      throw error;
    }
  }

  /**
   * Wait for Ollama to become available
   */
  private async waitForOllama(): Promise<void> {
    const startTime = Date.now();

    while (Date.now() - startTime < this.maxWaitTime) {
      if (await this.isRunning()) {
        console.log("✅ Ollama server is ready!");
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, this.checkInterval));
    }

    throw new Error(
      `Ollama did not start within ${this.maxWaitTime}ms. Please start it manually.`
    );
  }

  /**
   * Stop Ollama server (if we started it)
   */
  stop(): void {
    if (this.ollamaProcess) {
      try {
        this.ollamaProcess.kill();
        console.log("🛑 Ollama server stopped");
      } catch (error) {
        // Ignore errors when stopping
      }
    }
  }

  /**
   * Ensure Ollama is running (check and start if needed)
   */
  async ensureRunning(): Promise<void> {
    if (await this.isRunning()) {
      console.log("✅ Ollama is running");
      return;
    }

    if (!this.autoStart) {
      throw new Error(
        `Ollama is not running at ${this.baseURL}. Please start it manually or enable autoStart.`
      );
    }

    await this.start();
  }

  /**
   * List available models
   */
  async listModels(): Promise<string[]> {
    try {
      const response = await fetch(`${this.baseURL}/api/tags`, {
        method: "GET",
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        throw new Error(`Failed to list models: ${response.statusText}`);
      }

      const data = await response.json();
      return (data.models || []).map((m: any) => m.name || m.model || "");
    } catch (error: any) {
      throw new Error(`Failed to list Ollama models: ${error.message}`);
    }
  }
}

