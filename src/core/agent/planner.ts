/**
 * Very small rule-based planner. For the real product, this can be model-driven.
 */

export interface Plan {
  id: string;
  steps: Array<{ id: string; description: string; hint?: string }>;
  successCriteria?: string[];
}

import { ulid } from "ulid";

export function simplePlanner(userInput: string): Plan {
  const id = ulid();
  // naive: if user mentions 'add', plan read -> write
  const steps = [];
  if (/add|create|insert/i.test(userInput)) {
    steps.push({ id: "read", description: "Read target file", hint: "CALL: fs.read" });
    steps.push({ id: "update", description: "Write updated content", hint: "CALL: fs.write" });
  } else {
    steps.push({ id: "analyze", description: "Analyze and respond", hint: "" });
  }
  return { id, steps, successCriteria: ["task_confirmed"] };
}

