export function promptTokenEstimate(str: string): number {
  return Math.ceil(str.length / 4);
}

export function ensurePromptLimit(prompt: string, maxTokens = 4000): string {
  const tokens = promptTokenEstimate(prompt);
  if (tokens <= maxTokens) return prompt;
  const parts = prompt.split("\n");
  let acc = "";
  for (let i = parts.length - 1; i >= 0; i--) {
    if (promptTokenEstimate(acc + "\n" + parts[i]) > maxTokens) break;
    acc = parts[i] + "\n" + acc;
  }
  return acc;
}