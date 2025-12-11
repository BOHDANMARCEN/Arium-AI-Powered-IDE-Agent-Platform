/**
 * Ollama Manager
 * Handles Ollama service detection, startup, and model management
 */

import { spawn, exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export interface OllamaModel {
  name: string;
  id: string;
  size: string;
  modified: string;
}

export interface OllamaManagerConfig {
  baseURL?: string;
  autoStart?: boolean;
  defaultModel?: string;
  checkInterval?: number; // ms
}

export class OllamaManager {
  private baseURL: string;
  private autoStart: boolean;
  private defaultModel?: string;
  private checkInterval: number;
  private isRunning: boolean = false;
  private startupProcess: any = null;

  constructor(config: OllamaManagerConfig = {}) {
    this.baseURL = config.baseURL || "http://localhost:11434";
    this.autoStart = config.autoStart ?? true;
    this.defaultModel = config.defaultModel;
    this.checkInterval = config.checkInterval || 5000; // 5 seconds
  }

  /**
   * Check if Ollama service is running
   */
  async isAvailable(): Promise<boolean> {
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
   * Get list of available models
   */
  async listModels(): Promise<OllamaModel[]> {
    try {
      const response = await fetch(`${this.baseURL}/api/tags`, {
        method: "GET",
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.statusText}`);
      }

      const data = await response.json();
      return (data.models || []).map((model: any) => ({
        name: model.name,
        id: model.digest || model.name,
        size: this.formatSize(model.size),
        modified: model.modified_at || "unknown",
      }));
    } catch (error: any) {
      throw new Error(`Failed to list Ollama models: ${error.message}`);
    }
  }

  /**
   * Start Ollama service
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      return;
    }

    if (await this.isAvailable()) {
      this.isRunning = true;
      return;
    }

    console.log("🔄 Starting Ollama service...");

    try {
      // Try to start Ollama
      // On Windows, Ollama is usually installed as a service or runs as a background process
      // We'll try to run `ollama serve` in the background
      
      const isWindows = process.platform === "win32";
      
      if (isWindows) {
        // On Windows, try to start Ollama service
        try {
          await execAsync("net start Ollama", { timeout: 5000 });
          console.log("✅ Ollama service started");
          this.isRunning = true;
          return;
        } catch (serviceError) {
          // Service might not be installed or already running
          // Try to run ollama serve directly
        }
      }

      // Try to run `ollama serve` as a background process
      const ollamaProcess = spawn("ollama", ["serve"], {
        detached: !isWindows,
        stdio: ["ignore", "pipe", "pipe"],
        shell: isWindows,
      });

      this.startupProcess = ollamaProcess;

      // Wait a bit for Ollama to start
      await new Promise((resolve) => setTimeout(resolve, 3000));

      // Check if it's now available
      if (await this.isAvailable()) {
        console.log("✅ Ollama started successfully");
        this.isRunning = true;
        
        // On Windows, unref to allow parent process to exit
        if (isWindows) {
          ollamaProcess.unref();
        }
      } else {
        throw new Error("Ollama failed to start");
      }
    } catch (error: any) {
      console.warn("⚠️  Could not start Ollama automatically:", error.message);
      console.warn("   Please ensure Ollama is installed and in your PATH");
      console.warn("   Or start it manually with: ollama serve");
      throw error;
    }
  }

  /**
   * Ensure Ollama is running (check and start if needed)
   */
  async ensureRunning(): Promise<boolean> {
    if (await this.isAvailable()) {
      this.isRunning = true;
      return true;
    }

    if (!this.autoStart) {
      return false;
    }

    try {
      await this.start();
      return this.isRunning;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get recommended model from available models
   */
  async getRecommendedModel(): Promise<string | null> {
    try {
      const models = await this.listModels();
      
      if (models.length === 0) {
        return null;
      }

      // If default model is specified and available, use it
      if (this.defaultModel) {
        const found = models.find((m) => m.name === this.defaultModel);
        if (found) {
          return found.name;
        }
      }

      // Prefer coding models
      const codingModels = models.filter((m) =>
        m.name.toLowerCase().includes("code") ||
        m.name.toLowerCase().includes("coder") ||
        m.name.toLowerCase().includes("qwen")
      );

      if (codingModels.length > 0) {
        // Prefer larger models (better quality)
        codingModels.sort((a, b) => {
          const sizeA = this.parseSize(a.size);
          const sizeB = this.parseSize(b.size);
          return sizeB - sizeA;
        });
        return codingModels[0].name;
      }

      // Otherwise, return the largest model
      models.sort((a, b) => {
        const sizeA = this.parseSize(a.size);
        const sizeB = this.parseSize(b.size);
        return sizeB - sizeA;
      });

      return models[0].name;
    } catch (error) {
      return null;
    }
  }

  /**
   * Format bytes to human-readable size
   */
  private formatSize(bytes: number): string {
    if (!bytes || bytes === 0) return "-";
    const units = ["B", "KB", "MB", "GB", "TB"];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(1)} ${units[unitIndex]}`;
  }

  /**
   * Parse human-readable size to bytes
   */
  private parseSize(sizeStr: string): number {
    if (!sizeStr || sizeStr === "-") return 0;
    
    const match = sizeStr.match(/^([\d.]+)\s*([KMGT]?B)$/i);
    if (!match) return 0;

    const value = parseFloat(match[1]);
    const unit = match[2].toUpperCase();

    const multipliers: Record<string, number> = {
      B: 1,
      KB: 1024,
      MB: 1024 * 1024,
      GB: 1024 * 1024 * 1024,
      TB: 1024 * 1024 * 1024 * 1024,
    };

    return value * (multipliers[unit] || 1);
  }

  /**
   * Stop Ollama (if we started it)
   */
  stop(): void {
    if (this.startupProcess) {
      try {
        this.startupProcess.kill();
      } catch (error) {
        // Ignore
      }
      this.startupProcess = null;
    }
    this.isRunning = false;
  }
}

