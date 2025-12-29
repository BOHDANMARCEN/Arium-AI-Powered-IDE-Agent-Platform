/**
 * Golden Test Framework
 *
 * Framework for running tests that compare actual output against
 * expected "golden" reference files. Supports updating golden files
 * and diff-based comparison.
 */

import * as fs from "fs/promises";
import * as path from "path";
import { diff } from "jest-diff";

export interface GoldenTestOptions {
  /** Directory containing golden reference files */
  goldenDir: string;
  /** Whether to update golden files instead of comparing */
  updateGolden?: boolean;
  /** File extension for golden files */
  extension?: string;
  /** Custom serializer for test data */
  serializer?: (data: any) => string;
  /** Custom deserializer for golden files */
  deserializer?: (content: string) => any;
}

export interface GoldenTestResult {
  passed: boolean;
  actual?: any;
  expected?: any;
  diff?: string;
  goldenPath: string;
  error?: string;
}

/**
 * Default serializer - pretty JSON
 */
function defaultSerializer(data: any): string {
  return JSON.stringify(data, null, 2);
}

/**
 * Default deserializer - JSON parse
 */
function defaultDeserializer(content: string): any {
  return JSON.parse(content);
}

/**
 * Run a golden test
 */
export async function runGoldenTest(
  testName: string,
  actualData: any,
  options: GoldenTestOptions
): Promise<GoldenTestResult> {
  const {
    goldenDir,
    updateGolden = false,
    extension = ".json",
    serializer = defaultSerializer,
    deserializer = defaultDeserializer,
  } = options;

  const goldenPath = path.join(goldenDir, `${testName}${extension}`);

  try {
    // Ensure golden directory exists
    await fs.mkdir(goldenDir, { recursive: true });

    const serializedActual = serializer(actualData);

    if (updateGolden) {
      // Update mode: write the actual data as new golden file
      await fs.writeFile(goldenPath, serializedActual, "utf-8");
      return {
        passed: true,
        actual: actualData,
        goldenPath,
      };
    }

    // Compare mode: read golden file and compare
    let goldenContent: string;
    try {
      goldenContent = await fs.readFile(goldenPath, "utf-8");
    } catch (error) {
      // Golden file doesn't exist
      return {
        passed: false,
        actual: actualData,
        goldenPath,
        error: `Golden file does not exist: ${goldenPath}. Run with updateGolden=true to create it.`,
      };
    }

    const expectedData = deserializer(goldenContent);
    const isEqual = deepEqual(actualData, expectedData);

    if (isEqual) {
      return {
        passed: true,
        actual: actualData,
        expected: expectedData,
        goldenPath,
      };
    } else {
      const diffString = diff(expectedData, actualData, {
        contextLines: 3,
        expand: false,
      });

      return {
        passed: false,
        actual: actualData,
        expected: expectedData,
        diff: diffString || "No diff available",
        goldenPath,
        error: "Actual output does not match golden reference",
      };
    }
  } catch (error: any) {
    return {
      passed: false,
      actual: actualData,
      goldenPath,
      error: `Golden test failed: ${error.message}`,
    };
  }
}

/**
 * Jest matcher for golden tests
 */
export function toMatchGolden(
  received: any,
  options: GoldenTestOptions
): jest.CustomMatcherResult {
  return {
    pass: false, // We'll handle this in the test runner
    message: () => "Use runGoldenTest() directly in tests",
  };
}

/**
 * Test runner for golden tests with Jest integration
 */
export class GoldenTestRunner {
  private options: GoldenTestOptions;

  constructor(options: GoldenTestOptions) {
    this.options = options;
  }

  async test(testName: string, testFn: () => Promise<any> | any): Promise<void> {
    const actualData = await testFn();
    const result = await runGoldenTest(testName, actualData, this.options);

    if (!result.passed) {
      if (result.error) {
        throw new Error(result.error);
      } else if (result.diff) {
        throw new Error(`Golden test failed for "${testName}":\n${result.diff}`);
      } else {
        throw new Error(`Golden test failed for "${testName}"`);
      }
    }
  }

  async update(testName: string, testFn: () => Promise<any> | any): Promise<void> {
    const actualData = await testFn();
    const result = await runGoldenTest(testName, actualData, {
      ...this.options,
      updateGolden: true,
    });

    if (!result.passed) {
      throw new Error(`Failed to update golden file for "${testName}": ${result.error}`);
    }
  }
}

/**
 * Deep equality check for test data
 */
function deepEqual(a: any, b: any): boolean {
  if (a === b) return true;

  if (a == null || b == null) return a === b;

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }

  if (typeof a === "object" && typeof b === "object") {
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);

    if (keysA.length !== keysB.length) return false;

    for (const key of keysA) {
      if (!keysB.includes(key)) return false;
      if (!deepEqual(a[key], b[key])) return false;
    }
    return true;
  }

  return false;
}

/**
 * Utility to create golden directories structure
 */
export async function setupGoldenTestDirs(baseDir: string): Promise<void> {
  const dirs = [
    path.join(baseDir, "golden"),
    path.join(baseDir, "golden", "agent-responses"),
    path.join(baseDir, "golden", "tool-outputs"),
    path.join(baseDir, "golden", "vfs-snapshots"),
    path.join(baseDir, "golden", "event-logs"),
  ];

  for (const dir of dirs) {
    await fs.mkdir(dir, { recursive: true });
  }
}
