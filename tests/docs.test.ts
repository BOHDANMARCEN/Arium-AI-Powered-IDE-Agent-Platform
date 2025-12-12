/**
 * Documentation Generator Tests
 */

import * as fs from "fs/promises";
import * as path from "path";
import { DocumentationGenerator, generateDocumentation, generateToolDocumentation } from "../src/docs";

describe("Documentation Generator", () => {
  const testOutputDir = path.join(__dirname, "test-docs-output");

  beforeAll(async () => {
    // Clean up any existing test output
    try {
      await fs.rm(testOutputDir, { recursive: true, force: true });
    } catch {
      // Ignore if doesn't exist
    }
  });

  afterAll(async () => {
    // Clean up test output
    try {
      await fs.rm(testOutputDir, { recursive: true, force: true });
    } catch {
      // Ignore if doesn't exist
    }
  });

  describe("DocumentationGenerator class", () => {
    test("should initialize with options", () => {
      const generator = new DocumentationGenerator({
        sourceDirs: ["src/core"],
        outputDir: testOutputDir,
        formats: ["markdown"],
      });

      expect(generator).toBeInstanceOf(DocumentationGenerator);
    });

    test("should generate documentation", async () => {
      const generator = new DocumentationGenerator({
        sourceDirs: ["src/utils"], // Use simpler directory for testing
        outputDir: testOutputDir,
        formats: ["json"], // JSON is easier to test
        includePrivate: false,
        includeInternal: false,
      });

      await generator.generate();

      // Check if output files were created
      const jsonPath = path.join(testOutputDir, "json", "api.json");
      const exists = await fs.access(jsonPath).then(() => true).catch(() => false);
      expect(exists).toBe(true);
    }, 30000);

    test("should handle non-existent source directories", async () => {
      const generator = new DocumentationGenerator({
        sourceDirs: ["non-existent-dir"],
        outputDir: testOutputDir,
        formats: ["json"],
      });

      // Should not throw
      await expect(generator.generate()).resolves.not.toThrow();
    });
  });

  describe("generateDocumentation function", () => {
    test("should generate documentation with default options", async () => {
      await expect(generateDocumentation({
        sourceDirs: ["src/utils"],
        outputDir: path.join(testOutputDir, "defaults"),
        formats: ["json"],
      })).resolves.not.toThrow();
    });
  });

  describe("generateToolDocumentation function", () => {
    test("should generate tool documentation", async () => {
      const toolDocsDir = path.join(testOutputDir, "tools");

      await expect(generateToolDocumentation(toolDocsDir)).resolves.not.toThrow();

      // Check if markdown directory was created
      const markdownDir = path.join(toolDocsDir, "markdown");
      const exists = await fs.access(markdownDir).then(() => true).catch(() => false);
      expect(exists).toBe(true);
    });
  });

  describe("Output formats", () => {
    test("should generate markdown format", async () => {
      const generator = new DocumentationGenerator({
        sourceDirs: ["src/utils"],
        outputDir: path.join(testOutputDir, "markdown-test"),
        formats: ["markdown"],
      });

      await generator.generate();

      // Check if index.md was created
      const indexPath = path.join(testOutputDir, "markdown-test", "markdown", "index.md");
      const exists = await fs.access(indexPath).then(() => true).catch(() => false);
      expect(exists).toBe(true);
    });

    test("should generate HTML format", async () => {
      const generator = new DocumentationGenerator({
        sourceDirs: ["src/utils"],
        outputDir: path.join(testOutputDir, "html-test"),
        formats: ["html"],
      });

      await generator.generate();

      // Check if index.html was created
      const indexPath = path.join(testOutputDir, "html-test", "html", "index.html");
      const exists = await fs.access(indexPath).then(() => true).catch(() => false);
      expect(exists).toBe(true);
    });
  });

  describe("JSDoc parsing", () => {
    test("should parse basic JSDoc comments", async () => {
      // This test would require creating a temporary TypeScript file
      // and verifying the parsing. For now, we test the basic functionality.
      const generator = new DocumentationGenerator({
        sourceDirs: ["src/utils"],
        outputDir: path.join(testOutputDir, "jsdoc-test"),
        formats: ["json"],
      });

      await generator.generate();

      // Read the generated JSON and verify it contains expected structure
      const jsonPath = path.join(testOutputDir, "jsdoc-test", "json", "api.json");
      const content = await fs.readFile(jsonPath, "utf-8");
      const documentation = JSON.parse(content);

      expect(Array.isArray(documentation)).toBe(true);

      if (documentation.length > 0) {
        const item = documentation[0];
        expect(item).toHaveProperty("id");
        expect(item).toHaveProperty("name");
        expect(item).toHaveProperty("kind");
        expect(item).toHaveProperty("file");
        expect(item).toHaveProperty("line");
      }
    });
  });

  describe("Configuration options", () => {
    test("should respect includePrivate option", async () => {
      const generator = new DocumentationGenerator({
        sourceDirs: ["src/core"],
        outputDir: path.join(testOutputDir, "private-test"),
        formats: ["json"],
        includePrivate: false,
      });

      await generator.generate();

      const jsonPath = path.join(testOutputDir, "private-test", "json", "api.json");
      const content = await fs.readFile(jsonPath, "utf-8");
      const documentation = JSON.parse(content);

      // Should not include private members
      const privateItems = documentation.filter((item: any) => item.private);
      expect(privateItems.length).toBe(0);
    });

    test("should respect includeInternal option", async () => {
      const generator = new DocumentationGenerator({
        sourceDirs: ["src/core"],
        outputDir: path.join(testOutputDir, "internal-test"),
        formats: ["json"],
        includeInternal: false,
      });

      await generator.generate();

      const jsonPath = path.join(testOutputDir, "internal-test", "json", "api.json");
      const content = await fs.readFile(jsonPath, "utf-8");
      const documentation = JSON.parse(content);

      // Should not include internal members
      const internalItems = documentation.filter((item: any) => item.internal);
      expect(internalItems.length).toBe(0);
    });
  });

  describe("Error handling", () => {
    test("should handle invalid TypeScript files gracefully", async () => {
      const generator = new DocumentationGenerator({
        sourceDirs: ["src"], // Include all src files, some may have issues
        outputDir: path.join(testOutputDir, "error-test"),
        formats: ["json"],
      });

      // Should not throw even if some files have parsing issues
      await expect(generator.generate()).resolves.not.toThrow();
    });

    test("should handle template rendering errors", async () => {
      const generator = new DocumentationGenerator({
        sourceDirs: ["src/utils"],
        outputDir: path.join(testOutputDir, "template-error-test"),
        formats: ["markdown"],
        // Using invalid template directory to test error handling
        templatesDir: "/non-existent-templates",
      });

      // Should handle template errors gracefully
      await expect(generator.generate()).resolves.not.toThrow();
    });
  });
});
