/**
 * src/cli/commands/init.ts
 * arium init
 */

import { Command } from "commander";
import fs from "fs";
import path from "path";
import { promisify } from "util";

const mkdir = promisify(fs.mkdir);
const writeFile = promisify(fs.writeFile);
const exists = (p: string) => fs.existsSync(p);

export function initCommand(): Command {
  const cmd = new Command("init");
  cmd
    .description("Initialize Arium workspace (creates arium.config.json, tests/golden skeleton, docs/)")
    .option("-f, --force", "overwrite existing files")
    .action(async (opts: { force?: boolean }) => {
      try {
        const root = process.cwd();

        const configPath = path.join(root, "arium.config.json");
        const testsPath = path.join(root, "tests", "golden");
        const docsPath = path.join(root, "docs");

        if (!opts.force && exists(configPath)) {
          console.log("arium.config.json already exists. Use --force to overwrite.");
        } else {
          const defaultConfig = {
            modelProfile: "fast",
            maxSteps: 50,
            logger: { level: "info", json: false }
          };
          await writeFile(configPath, JSON.stringify(defaultConfig, null, 2), { encoding: "utf8" });
          console.log("Created arium.config.json");
        }

        if (!exists(testsPath)) {
          await mkdir(testsPath, { recursive: true });
          await writeFile(path.join(testsPath, "README.md"), "# Golden tests\n\nAdd your cases here.", { encoding: "utf8" });
          console.log("Created tests/golden skeleton");
        } else {
          console.log("tests/golden already exists");
        }

        if (!exists(docsPath)) {
          await mkdir(docsPath, { recursive: true });
          await writeFile(path.join(docsPath, "README.md"), "# Docs\n\nGenerated documentation will appear here.", { encoding: "utf8" });
          console.log("Created docs/ folder");
        } else {
          console.log("docs/ already exists");
        }

        console.log("Initialization complete.");
      } catch (e) {
        console.error("Failed to initialize workspace:", (e as Error).message);
        process.exit(1);
      }
    });

  return cmd;
}
