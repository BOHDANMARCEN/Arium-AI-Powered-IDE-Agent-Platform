/**
 * Ollama Service Manager
 * Handles checking and auto-starting Ollama service
 */

import { spawn, exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export interface OllamaStatus {
  available: boolean;
  running: boolean;
  error?: string;
  models?: string[];
}

/**
 * Check if Ollama is available and running
 */
export async function checkOllamaStatus(baseURL: string = "http://localhost:11434"): Promise<OllamaStatus> {
  try {
    const response = await fetch(`${baseURL}/api/tags`, {
      method: "GET",
      signal: AbortSignal.timeout(3000), // 3 second timeout
    });

    if (!response.ok) {
      return {
        available: false,
        running: false,
        error: `Ollama API returned ${response.status}`,
      };
    }

    const data = await response.json();
    const models = (data.models || []).map((m: any) => m.name);

    return {
      available: true,
      running: true,
      models,
    };
  } catch (error: any) {
    return {
      available: false,
      running: false,
      error: error.message || "Ollama is not running",
    };
  }
}

/**
 * Attempt to start Ollama service
 * On Windows, this tries to run `ollama serve` in the background
 */
export async function startOllama(): Promise<{ success: boolean; error?: string }> {
  try {
    // Check if ollama command exists
    try {
      await execAsync("ollama --version");
    } catch {
      return {
        success: false,
        error: "Ollama command not found. Please install Ollama first.",
      };
    }

    // Check if already running
    const status = await checkOllamaStatus();
    if (status.running) {
      return { success: true };
    }

    // Try to start Ollama
    // On Windows, we'll spawn it in the background
    const isWindows = process.platform === "win32";
    
    if (isWindows) {
      // On Windows, use start command to run in new window (detached)
      // Or use spawn with detached option
      const ollamaProcess = spawn("ollama", ["serve"], {
        detached: true,
        stdio: "ignore",
        shell: true,
      });

      ollamaProcess.unref(); // Allow parent process to exit

      // Wait a bit for Ollama to start
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Check if it started
      const newStatus = await checkOllamaStatus();
      if (newStatus.running) {
        return { success: true };
      }

      return {
        success: false,
        error: "Ollama process started but service is not responding",
      };
    } else {
      // On Unix-like systems, try to start in background
      const ollamaProcess = spawn("ollama", ["serve"], {
        detached: true,
        stdio: "ignore",
      });

      ollamaProcess.unref();

      await new Promise((resolve) => setTimeout(resolve, 2000));

      const newStatus = await checkOllamaStatus();
      if (newStatus.running) {
        return { success: true };
      }

      return {
        success: false,
        error: "Ollama process started but service is not responding",
      };
    }
  } catch (error: any) {
    return {
      success: false,
      error: error.message || "Failed to start Ollama",
    };
  }
}

/**
 * Ensure Ollama is running, attempt to start if not
 */
export async function ensureOllamaRunning(
  baseURL: string = "http://localhost:11434",
  autoStart: boolean = true
): Promise<OllamaStatus> {
  let status = await checkOllamaStatus(baseURL);

  if (!status.running && autoStart) {
    console.log("🔄 Ollama is not running. Attempting to start...");
    const startResult = await startOllama();

    if (startResult.success) {
      // Wait a bit more and check again
      await new Promise((resolve) => setTimeout(resolve, 3000));
      status = await checkOllamaStatus(baseURL);
    } else {
      status.error = startResult.error || "Failed to start Ollama";
    }
  }

  return status;
}

/**
 * List available Ollama models
 */
export async function listOllamaModels(baseURL: string = "http://localhost:11434"): Promise<string[]> {
  try {
    const response = await fetch(`${baseURL}/api/tags`, {
      method: "GET",
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      return [];
    }

    const data = await response.json();
    return (data.models || []).map((m: any) => m.name);
  } catch {
    return [];
  }
}

