/**
 * tests/cli/init.test.ts
 * Integration test for `arium init`
 */

import fs from "fs";
import path from "path";
import { execa } from "execa";

const TMP = path.join(__dirname, "..", "tmp", "cli-init");
beforeAll(() => {
  if (fs.existsSync(TMP)) fs.rmSync(TMP, { recursive: true, force: true });
  fs.mkdirSync(TMP, { recursive: true });
});
afterAll(() => {
  if (fs.existsSync(TMP)) fs.rmSync(TMP, { recursive: true, force: true });
});

test("arium init creates config and folders", async () => {
  const cliPath = path.join(process.cwd(), "dist", "cli", "index.js");
  // Build must be run before tests in CI step
  const result = await execa("node", [cliPath, "init"], { cwd: TMP });
  expect(result.exitCode).toBe(0);
  expect(fs.existsSync(path.join(TMP, "arium.config.json"))).toBeTruthy();
  expect(fs.existsSync(path.join(TMP, "tests", "golden"))).toBeTruthy();
  expect(fs.existsSync(path.join(TMP, "docs"))).toBeTruthy();
});
