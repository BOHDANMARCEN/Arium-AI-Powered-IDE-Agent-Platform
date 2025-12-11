import { exec } from "child_process";

export const listOllamaModels = {
  id: "ollama.listModels",
  name: "List Ollama Models",
  description: "Returns a list of installed Ollama models.",
  runner: "js-runner",
  schema: {
    type: "object",
    properties: {},
    required: [],
  },
  permissions: ["exec.limited"],

  run: async () => {
    return new Promise((resolve, reject) => {
      exec("ollama list", { timeout: 3000 }, (err, stdout) => {
        if (err) return reject(err);

        const lines = stdout.trim().split("\n").slice(1);
        const models = lines.map((l) => {
          const parts = l.split(/\s+/);
          return {
            name: parts[0],
            id: parts[1],
            size: parts[2],
            modified: parts.slice(3).join(" "),
          };
        });

        resolve(models);
      });
    });
  },
};