/**
 * src/cli/index.ts
 * CLI entry (commander)
 *
 * Authors:
 * Bogdan Marcen — Founder & Lead Developer
 * ChatGPT 5.1 — AI Architect & Co-Developer
 */

import { Command } from "commander";
import { initCommand } from "./commands/init";
import { runCommand } from "./commands/run";
import { toolsListCommand } from "./commands/toolsList";
import { toolsDocsCommand } from "./commands/toolsDocs";

export function createCli(): Command {
  const program = new Command();

  program
    .name("arium")
    .description("Arium CLI — manage Arium agents, tools and tests")
    .version("0.2.0");

  program.addCommand(initCommand());
  program.addCommand(runCommand());
  program.addCommand(toolsListCommand());
  program.addCommand(toolsDocsCommand());

  return program;
}

if (require.main === module) {
  const cli = createCli();
  cli.parse(process.argv);
}
