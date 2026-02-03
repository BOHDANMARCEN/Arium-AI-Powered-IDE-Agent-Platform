/**
 * src/cli/commands/run.ts
 * arium run --case <name>
 */

import { Command } from "commander";
import path from "path";
import fs from "fs";

export function runCommand(): Command {
  const cmd = new Command("run");
  cmd
    .description("Run a golden case or an agent in dev mode")
    .option("--case <caseName>", "golden case name")
    .option("--adapter <name>", "model adapter to use (openai|gemini|ollama)")
    .action(async (opts: { case?: string; adapter?: string }) => {
      try {
        if (opts.case) {
          const casePath = path.join(process.cwd(), "tests", "golden", opts.case, "input.json");
          if (!fs.existsSync(casePath)) {
            console.error("Case not found:", casePath);
            process.exit(1);
          }
          console.log("Running golden case:", opts.case, "with adapter:", opts.adapter ?? "default");
          // TODO: invoke runner.runGoldenCase(casePath, adapter)
          // placeholder:
          console.log("Simulated run — implement runner invocation in codebase.");
          process.exit(0);
        } else {
          console.log("Starting interactive dev agent run (TODO)");
          process.exit(0);
        }
      } catch (e) {
        console.error("Run failed:", (e as Error).message);
        process.exit(1);
      }
    });

  return cmd;
}
