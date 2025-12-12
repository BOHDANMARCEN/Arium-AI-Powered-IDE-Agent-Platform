/**
 * src/cli/commands/toolsDocs.ts
 * arium tools:docs
 */

import { Command } from "commander";
import path from "path";

export function toolsDocsCommand(): Command {
  const cmd = new Command("tools:docs");
  cmd
    .description("Generate docs for tools (requires docs generator)")
    .option("-o, --out <dir>", "output directory", "docs/tools")
    .action(async (opts: { out: string }) => {
      try {
        console.log(`Generating tool documentation to ${opts.out}...`);

        // Import and run docs generator
        const { generateToolDocumentation } = await import("../../docs");
        await generateToolDocumentation(opts.out);

        console.log(`✅ Tool documentation generated successfully in ${opts.out}`);
      } catch (e) {
        console.error("Failed to generate tools docs:", (e as Error).message);
        process.exit(1);
      }
    });
  return cmd;
}
