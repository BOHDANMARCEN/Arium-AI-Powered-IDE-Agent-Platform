import { useEffect, useState } from "react";
import { invokeTool } from "../api/tools";
import type React from "react";

interface ModelSelectorProps {
  current: string;
  onSelect: (model: string) => void;
}

interface OllamaModel {
  name: string;
  id?: string;
  size?: string;
  modified?: string;
}

export function ModelSelector({ current, onSelect }: ModelSelectorProps) {
  const [models, setModels] = useState<OllamaModel[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchModels = async () => {
      try {
        setLoading(true);
        const result = await invokeTool("ollama.listModels");
        if (result.ok && result.data) {
          setModels(result.data);
        } else {
          throw new Error(result.error?.message || "Failed to fetch models");
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    };

    fetchModels();
  }, []);

  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm text-gray-300" htmlFor="model-selector">Default Ollama Model</label>
      {loading ? (
        <div className="bg-gray-800 border border-gray-600 rounded p-2 text-gray-400">
          Loading models...
        </div>
      ) : error ? (
        <div className="bg-red-900 border border-red-700 rounded p-2 text-red-300">
          Error: {error}
        </div>
      ) : (
        <select
          id="model-selector"
          className="bg-gray-800 border border-gray-600 rounded p-2"
          value={current}
          onChange={(e: React.ChangeEvent<HTMLSelectElement>) => onSelect(e.target.value)}
        >
          {models.map((m: OllamaModel) => (
            <option key={m.id || m.name} value={m.name}>
              {m.name} — {m.size}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}