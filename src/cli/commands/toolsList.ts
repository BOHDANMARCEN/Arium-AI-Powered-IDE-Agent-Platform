/**
 * src/cli/commands/toolsList.ts
 * arium tools:list
 */

import { Command } from "commander";
import { printTable } from "../utils/printTable";
// import { ToolRegistry } from "../../core/tool-engine"; // integrate later

export function toolsListCommand(): Command {
  const cmd = new Command("tools:list");
  cmd.description("List registered tools")
    .action(async () => {
      // Placeholder: in real code, query ToolRegistry
      const rows = [
        ["echo", "execute_code", "Echo tool"],
        ["readFile", "read_files", "Read file from VFS"]
      ];
      printTable(["NAME", "PERMISSIONS", "DESCRIPTION"], rows);
    });
  return cmd;
}
