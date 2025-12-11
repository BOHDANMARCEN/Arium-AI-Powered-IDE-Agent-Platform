import fetch from "node-fetch";
import { exec } from "child_process";
import util from "util";

const shell = util.promisify(exec);

export class OllamaModelService {
  constructor({ model, url = "http://localhost:11434" }) {
    this.model = model;
    this.url = url;
  }

  async isModelRunning() {
    try {
      const res = await fetch(`${this.url}/api/tags`, { timeout: 1500 });
      const data = await res.json();

      // If tags endpoint works — Ollama daemon is alive.
      // But model might still be unloaded, so we must check generate warm-up.
      return true;
    } catch {
      return false;
    }
  }

  async warmup() {
    try {
      const res = await fetch(`${this.url}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: this.model,
          prompt: "warmup",
          stream: false
        }),
      });

      if (res.status === 200) return true;
    } catch {}

    return false;
  }

  async startModel() {
    console.log(`[Ollama] Starting model ${this.model}...`);

    try {
      await shell(`ollama run ${this.model} --now`);
      return true;
    } catch (err) {
      console.error("Failed to start model:", err);
      return false;
    }
  }

  async ensureModelReady() {
    // 1 — Check daemon
    const running = await this.isModelRunning();
    if (!running) {
      console.log(`[Ollama] Daemon not responding. Trying to start '${this.model}'...`);
      await this.startModel();
    }

    // 2 — Warmup the model
    console.log("[Ollama] Warming up...");
    const ok = await this.warmup();
    if (ok) {
      console.log("[Ollama] Model is ready.");
      return true;
    }

    // 3 — If warmup failed → force start model
    console.log("[Ollama] Model not loaded. Attempting full start...");
    await this.startModel();

    const ok2 = await this.warmup();
    if (ok2) {
      console.log("[Ollama] Model warmed after restart.");
      return true;
    }

    throw new Error(`Cannot initialize Ollama model: ${this.model}`);
  }
}