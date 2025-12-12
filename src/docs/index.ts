/**
 * Documentation Generation System
 *
 * Auto-generates documentation from TypeScript/JSDoc comments
 * Supports multiple output formats (Markdown, HTML, JSON)
 *
 * Authors:
 * Bogdan Marcen — Founder & Lead Developer
 * ChatGPT 5.1 — AI Architect & Co-Developer
 */

import * as fs from "fs/promises";
import { readFileSync } from "fs";
import * as path from "path";
import { Project, Node, SyntaxKind, JSDoc, Symbol as TSSymbol, Type } from "ts-morph";
import Handlebars from "handlebars";
import { logger } from "../core/logger";

export interface DocGenerationOptions {
  /** Source directories to scan */
  sourceDirs: string[];
  /** Output directory */
  outputDir: string;
  /** Output formats */
  formats: ("markdown" | "html" | "json")[];
  /** Include private members */
  includePrivate?: boolean;
  /** Include internal members */
  includeInternal?: boolean;
  /** Custom templates directory */
  templatesDir?: string;
  /** Base URL for links */
  baseUrl?: string;
}

export interface DocumentationItem {
  id: string;
  name: string;
  kind: string;
  description?: string;
  summary?: string;
  examples?: string[];
  params?: ParameterDoc[];
  returns?: ReturnDoc;
  properties?: PropertyDoc[];
  methods?: MethodDoc[];
  type?: string;
  file: string;
  line: number;
  tags: Record<string, string>;
  deprecated?: boolean;
  since?: string;
  internal?: boolean;
  private?: boolean;
}

export interface ParameterDoc {
  name: string;
  type: string;
  description?: string;
  optional?: boolean;
  defaultValue?: string;
}

export interface ReturnDoc {
  type: string;
  description?: string;
}

export interface PropertyDoc {
  name: string;
  type: string;
  description?: string;
  optional?: boolean;
  readonly?: boolean;
}

export interface MethodDoc {
  name: string;
  description?: string;
  params?: ParameterDoc[];
  returns?: ReturnDoc;
  examples?: string[];
}

/**
 * Documentation Generator
 */
export class DocumentationGenerator {
  private project: Project;
  private options: DocGenerationOptions;
  private templates: Map<string, HandlebarsTemplateDelegate> = new Map();

  constructor(options: DocGenerationOptions) {
    this.options = {
      includePrivate: false,
      includeInternal: false,
      ...options,
    };

    this.project = new Project({
      tsConfigFilePath: path.join(process.cwd(), "tsconfig.json"),
      skipAddingFilesFromTsConfig: true,
    });

    // Add source files
    for (const sourceDir of this.options.sourceDirs) {
      const fullPath = path.resolve(sourceDir);
      this.project.addSourceFilesAtPaths(`${fullPath}/**/*{.ts,.tsx}`);
    }

    this.loadTemplates();
  }

  /**
   * Generate documentation
   */
  async generate(): Promise<void> {
    logger.info("Starting documentation generation", {
      sourceDirs: this.options.sourceDirs,
      outputDir: this.options.outputDir,
      formats: this.options.formats,
    });

    const startTime = Date.now();
    const documentation: DocumentationItem[] = [];

    // Analyze source files
    for (const sourceFile of this.project.getSourceFiles()) {
      try {
        const items = this.analyzeSourceFile(sourceFile);
        documentation.push(...items);
      } catch (error: any) {
        logger.warn(`Failed to analyze ${sourceFile.getFilePath()}: ${error.message}`);
      }
    }

    // Generate output files
    for (const format of this.options.formats) {
      await this.generateFormat(documentation, format);
    }

    const duration = Date.now() - startTime;
    logger.info("Documentation generation completed", {
      itemsGenerated: documentation.length,
      duration,
      formats: this.options.formats,
    });
  }

  /**
   * Analyze a single source file
   */
  private analyzeSourceFile(sourceFile: any): DocumentationItem[] {
    const items: DocumentationItem[] = [];
    const filePath = sourceFile.getFilePath();

    // Analyze classes
    for (const classDeclaration of sourceFile.getClasses()) {
      if (this.shouldIncludeDeclaration(classDeclaration)) {
        items.push(this.analyzeClass(classDeclaration, filePath));
      }
    }

    // Analyze interfaces
    for (const interfaceDeclaration of sourceFile.getInterfaces()) {
      if (this.shouldIncludeDeclaration(interfaceDeclaration)) {
        items.push(this.analyzeInterface(interfaceDeclaration, filePath));
      }
    }

    // Analyze functions
    for (const functionDeclaration of sourceFile.getFunctions()) {
      if (this.shouldIncludeDeclaration(functionDeclaration)) {
        items.push(this.analyzeFunction(functionDeclaration, filePath));
      }
    }

    // Analyze type aliases
    for (const typeAlias of sourceFile.getTypeAliases()) {
      if (this.shouldIncludeDeclaration(typeAlias)) {
        items.push(this.analyzeTypeAlias(typeAlias, filePath));
      }
    }

    return items;
  }

  /**
   * Analyze a class declaration
   */
  private analyzeClass(classDeclaration: any, filePath: string): DocumentationItem {
    const jsDoc = this.getJSDoc(classDeclaration);
    const properties: PropertyDoc[] = [];
    const methods: MethodDoc[] = [];

    // Analyze properties
    for (const property of classDeclaration.getProperties()) {
      if (this.shouldIncludeDeclaration(property)) {
        properties.push(this.analyzeProperty(property));
      }
    }

    // Analyze methods
    for (const method of classDeclaration.getMethods()) {
      if (this.shouldIncludeDeclaration(method)) {
        methods.push(this.analyzeMethod(method));
      }
    }

    return {
      id: classDeclaration.getName() || "anonymous",
      name: classDeclaration.getName() || "Anonymous Class",
      kind: "class",
      description: jsDoc?.description,
      summary: jsDoc?.summary,
      examples: jsDoc?.examples,
      properties,
      methods,
      file: path.relative(process.cwd(), filePath),
      line: classDeclaration.getStartLineNumber(),
      tags: jsDoc?.tags || {},
      deprecated: jsDoc?.deprecated,
      since: jsDoc?.since,
      internal: jsDoc?.internal,
      private: classDeclaration.isPrivate() || classDeclaration.isProtected(),
    };
  }

  /**
   * Analyze an interface declaration
   */
  private analyzeInterface(interfaceDeclaration: any, filePath: string): DocumentationItem {
    const jsDoc = this.getJSDoc(interfaceDeclaration);
    const properties: PropertyDoc[] = [];
    const methods: MethodDoc[] = [];

    // Analyze properties
    for (const property of interfaceDeclaration.getProperties()) {
      properties.push(this.analyzeProperty(property));
    }

    // Analyze methods
    for (const method of interfaceDeclaration.getMethods()) {
      methods.push(this.analyzeMethod(method));
    }

    return {
      id: interfaceDeclaration.getName() || "anonymous",
      name: interfaceDeclaration.getName() || "Anonymous Interface",
      kind: "interface",
      description: jsDoc?.description,
      summary: jsDoc?.summary,
      examples: jsDoc?.examples,
      properties,
      methods,
      file: path.relative(process.cwd(), filePath),
      line: interfaceDeclaration.getStartLineNumber(),
      tags: jsDoc?.tags || {},
      deprecated: jsDoc?.deprecated,
      since: jsDoc?.since,
      internal: jsDoc?.internal,
    };
  }

  /**
   * Analyze a function declaration
   */
  private analyzeFunction(functionDeclaration: any, filePath: string): DocumentationItem {
    const jsDoc = this.getJSDoc(functionDeclaration);

    return {
      id: functionDeclaration.getName() || "anonymous",
      name: functionDeclaration.getName() || "Anonymous Function",
      kind: "function",
      description: jsDoc?.description,
      summary: jsDoc?.summary,
      examples: jsDoc?.examples,
      params: jsDoc?.params,
      returns: jsDoc?.returns,
      file: path.relative(process.cwd(), filePath),
      line: functionDeclaration.getStartLineNumber(),
      tags: jsDoc?.tags || {},
      deprecated: jsDoc?.deprecated,
      since: jsDoc?.since,
      internal: jsDoc?.internal,
    };
  }

  /**
   * Analyze a type alias
   */
  private analyzeTypeAlias(typeAlias: any, filePath: string): DocumentationItem {
    const jsDoc = this.getJSDoc(typeAlias);

    return {
      id: typeAlias.getName(),
      name: typeAlias.getName(),
      kind: "type",
      description: jsDoc?.description,
      summary: jsDoc?.summary,
      examples: jsDoc?.examples,
      type: typeAlias.getType().getText(),
      file: path.relative(process.cwd(), filePath),
      line: typeAlias.getStartLineNumber(),
      tags: jsDoc?.tags || {},
      deprecated: jsDoc?.deprecated,
      since: jsDoc?.since,
      internal: jsDoc?.internal,
    };
  }

  /**
   * Analyze a property
   */
  private analyzeProperty(property: any): PropertyDoc {
    const jsDoc = this.getJSDoc(property);

    return {
      name: property.getName(),
      type: property.getType().getText(),
      description: jsDoc?.description,
      optional: property.isOptional(),
      readonly: property.isReadonly(),
    };
  }

  /**
   * Analyze a method
   */
  private analyzeMethod(method: any): MethodDoc {
    const jsDoc = this.getJSDoc(method);

    return {
      name: method.getName(),
      description: jsDoc?.description,
      params: jsDoc?.params,
      returns: jsDoc?.returns,
      examples: jsDoc?.examples,
    };
  }

  /**
   * Extract JSDoc information
   */
  private getJSDoc(node: any): {
    description?: string;
    summary?: string;
    examples?: string[];
    params?: ParameterDoc[];
    returns?: ReturnDoc;
    tags: Record<string, string>;
    deprecated?: boolean;
    since?: string;
    internal?: boolean;
  } | null {
    const jsDocs = node.getJsDocs();
    if (jsDocs.length === 0) return null;

    const jsDoc = jsDocs[0];
    const tags: Record<string, string> = {};

    let description = "";
    let summary = "";
    const examples: string[] = [];
    const params: ParameterDoc[] = [];
    let returns: ReturnDoc | undefined;
    let deprecated = false;
    let since: string | undefined;
    let internal = false;

    for (const tag of jsDoc.getTags()) {
      const tagName = tag.getTagName();
      const comment = tag.getComment()?.toString() || "";

      switch (tagName) {
        case "description":
          description = comment;
          break;
        case "summary":
          summary = comment;
          break;
        case "example":
          examples.push(comment);
          break;
        case "param": {
          const paramName = tag.getName();
          const paramType = tag.getTypeExpression()?.getText() || "any";
          params.push({
            name: paramName || "",
            type: paramType,
            description: comment,
          });
          break;
        }
        case "returns":
        case "return": {
          const returnType = tag.getTypeExpression()?.getText() || "any";
          returns = {
            type: returnType,
            description: comment,
          };
          break;
        }
        case "deprecated":
          deprecated = true;
          break;
        case "since":
          since = comment;
          break;
        case "internal":
          internal = true;
          break;
        default:
          tags[tagName] = comment;
      }
    }

    // If no explicit summary, use first line of description
    if (!summary && description) {
      summary = description.split("\n")[0];
    }

    return {
      description: description || undefined,
      summary: summary || undefined,
      examples: examples.length > 0 ? examples : undefined,
      params: params.length > 0 ? params : undefined,
      returns,
      tags,
      deprecated,
      since,
      internal,
    };
  }

  /**
   * Check if declaration should be included
   */
  private shouldIncludeDeclaration(declaration: any): boolean {
    if (!this.options.includePrivate && (declaration.isPrivate?.() || declaration.isProtected?.())) {
      return false;
    }

    const jsDoc = this.getJSDoc(declaration);
    if (!this.options.includeInternal && jsDoc?.internal) {
      return false;
    }

    return true;
  }

  /**
   * Load Handlebars templates
   */
  private loadTemplates(): void {
    const templateDir = this.options.templatesDir || path.join(__dirname, "templates");

    // Default templates
    const defaultTemplates = {
      markdown: `# {{name}}

{{#if description}}{{description}}{{/if}}

{{#if since}}**Since:** {{since}}{{/if}}
{{#if deprecated}}**Deprecated**{{/if}}

## Overview

{{#if summary}}{{summary}}{{/if}}

## Properties

{{#each properties}}
- \`{{name}}\`: {{type}} - {{description}}
{{/each}}

## Methods

{{#each methods}}
### {{name}}

{{#if description}}{{description}}{{/if}}

**Parameters:**
{{#each params}}
- \`{{name}}\`: {{type}} - {{description}}
{{/each}}

**Returns:** {{returns.type}} - {{returns.description}}
{{/each}}
`,
      html: `<!DOCTYPE html>
<html>
<head>
  <title>{{name}} - API Documentation</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 40px; }
    .header { border-bottom: 1px solid #ccc; padding-bottom: 20px; }
    .deprecated { color: red; }
    .property, .method { margin: 10px 0; padding: 10px; border: 1px solid #eee; }
    .code { font-family: monospace; background: #f5f5f5; padding: 2px 4px; }
  </style>
</head>
<body>
  <div class="header">
    <h1>{{name}}</h1>
    {{#if description}}<p>{{description}}</p>{{/if}}
    {{#if deprecated}}<p class="deprecated">⚠️ Deprecated</p>{{/if}}
  </div>

  <h2>Properties</h2>
  {{#each properties}}
  <div class="property">
    <code class="code">{{name}}: {{type}}</code>
    {{#if description}}<p>{{description}}</p>{{/if}}
  </div>
  {{/each}}

  <h2>Methods</h2>
  {{#each methods}}
  <div class="method">
    <h3>{{name}}</h3>
    {{#if description}}<p>{{description}}</p>{{/if}}
  </div>
  {{/each}}
</body>
</html>`,
    };

    // Try to load custom templates, fall back to defaults
    for (const format of this.options.formats) {
      try {
        const templatePath = path.join(templateDir, `${format}.hbs`);
        const templateContent = readFileSync(templatePath, "utf-8");
        this.templates.set(format, Handlebars.compile(templateContent));
      } catch {
        const templateKey = format as keyof typeof defaultTemplates;
        this.templates.set(format, Handlebars.compile(defaultTemplates[templateKey] || ""));
      }
    }
  }

  /**
   * Generate documentation in a specific format
   */
  private async generateFormat(documentation: DocumentationItem[], format: string): Promise<void> {
    const outputDir = path.join(this.options.outputDir, format);
    await fs.mkdir(outputDir, { recursive: true });

    const template = this.templates.get(format);
    if (!template) {
      throw new Error(`No template found for format: ${format}`);
    }

    if (format === "json") {
      // JSON format - single file
      const jsonPath = path.join(outputDir, "api.json");
      await fs.writeFile(jsonPath, JSON.stringify(documentation, null, 2));
    } else {
      // Individual files for each item
      for (const item of documentation) {
        const filename = `${item.id}.${format === "html" ? "html" : "md"}`;
        const filePath = path.join(outputDir, filename);

        try {
          const content = template({ ...item, baseUrl: this.options.baseUrl });
          await fs.writeFile(filePath, content);
        } catch (error: any) {
          logger.warn(`Failed to generate ${format} for ${item.id}: ${error.message}`);
        }
      }

      // Generate index file
      const indexContent = this.generateIndex(documentation, format);
      const indexPath = path.join(outputDir, `index.${format === "html" ? "html" : "md"}`);
      await fs.writeFile(indexPath, indexContent);
    }

    logger.info(`Generated ${format} documentation`, {
      outputDir,
      itemCount: documentation.length,
    });
  }

  /**
   * Generate index file
   */
  private generateIndex(documentation: DocumentationItem[], format: string): string {
    const itemsByKind = documentation.reduce((acc, item) => {
      if (!acc[item.kind]) acc[item.kind] = [];
      acc[item.kind].push(item);
      return acc;
    }, {} as Record<string, DocumentationItem[]>);

    if (format === "html") {
      return `<!DOCTYPE html>
<html>
<head>
  <title>API Documentation</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 40px; }
    .section { margin: 20px 0; }
    .item { margin: 5px 0; }
    .kind { font-weight: bold; color: #666; }
  </style>
</head>
<body>
  <h1>API Documentation</h1>
  <p>Generated on ${new Date().toISOString()}</p>

  ${Object.entries(itemsByKind).map(([kind, items]) => `
  <div class="section">
    <h2 class="kind">${kind.charAt(0).toUpperCase() + kind.slice(1)}s</h2>
    ${items.map(item => `<div class="item"><a href="${item.id}.html">${item.name}</a></div>`).join("")}
  </div>
  `).join("")}
</body>
</html>`;
    } else {
      return `# API Documentation

Generated on ${new Date().toISOString()}

${Object.entries(itemsByKind).map(([kind, items]) => `
## ${kind.charAt(0).toUpperCase() + kind.slice(1)}s

${items.map(item => `- [${item.name}](${item.id}.md)`).join("\n")}
`).join("\n")}`;
    }
  }
}

/**
 * Generate documentation with default options
 */
export async function generateDocumentation(options: Partial<DocGenerationOptions> = {}): Promise<void> {
  const defaultOptions: DocGenerationOptions = {
    sourceDirs: ["src"],
    outputDir: "docs/api",
    formats: ["markdown", "html"],
    includePrivate: false,
    includeInternal: false,
  };

  const generator = new DocumentationGenerator({ ...defaultOptions, ...options });
  await generator.generate();
}

/**
 * Generate tool documentation specifically
 */
export async function generateToolDocumentation(outputDir: string = "docs/tools"): Promise<void> {
  const generator = new DocumentationGenerator({
    sourceDirs: ["src/core/tools"],
    outputDir,
    formats: ["markdown"],
    includePrivate: false,
    includeInternal: true,
  });

  await generator.generate();
}
