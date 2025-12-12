/**
 * src/cli/utils/loadConfig.ts
 */

import fs from "fs";
import path from "path";

export interface AriumConfig {
  modelProfile?: string;
  maxSteps?: number;
  logger?: { level?: string; json?: boolean };
}

export function loadConfig(): AriumConfig {
  const p = path.join(process.cwd(), "arium.config.json");
  if (!fs.existsSync(p)) return {};
  try {
    const raw = fs.readFileSync(p, "utf8");
    return JSON.parse(raw) as AriumConfig;
  } catch {
    return {};
  }
}
