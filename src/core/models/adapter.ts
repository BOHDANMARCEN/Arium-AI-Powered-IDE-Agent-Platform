/**
  * Unified ModelAdapter API for Arium 0.2.0
  * Standardized interface for all model adapters
  *
  * Author: Bogdan Marcen & ChatGPT 5.1
  */

import { z } from "zod";
import { Result } from "../utils/result";
import { ModelError } from "../errors/standardErrors";
import { EventBus } from "../eventBus";

/**
  * Standardized model input format
  */
export interface ModelInput {
  prompt: string;
  context?: string[];
  options?: {
    temperature?: number;
    max_tokens?: number;
    tools?: ToolSpec[];
    tool_choice?: "auto" | "none" | { type: "function"; function: { name: string } };
  };
}

/**
  * Standardized model output format
  */
export interface ModelOutput {
  type: "final" | "tool";
  content?: string;
  tool?: string;
  arguments?: Record<string, unknown>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}

/**
  * Model chunk for streaming responses
  */
export interface ModelChunk {
  content: string;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
  };
}

/**
  * Unified ModelAdapter interface
  */
export interface ModelAdapter {
  id: string;
  supportsStreaming: boolean;
  eventBus: EventBus;

  generate(input: ModelInput): Promise<Result<ModelOutput, ModelError>>;
  stream?(input: ModelInput): AsyncGenerator<ModelChunk, void, unknown>;
}

/**
  * Tool specification for model adapters
  */
export interface ToolSpec {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>; // JSON Schema
  };
}

/**
  * Model adapter configuration
  */
export interface ModelAdapterConfig {
  maxRetries?: number;
  retryIntervals?: number[];
  timeoutMs?: number;
}

/**
  * Model profile types
  */
export type ModelProfileType = "fast" | "smart" | "cheap" | "secure";

/**
  * Model profile configuration
  */
export interface ModelProfile {
  type: ModelProfileType;
  modelName: string;
  temperature: number;
  max_tokens: number;
  safetySettings?: {
    harmfulContentThreshold?: "block_none" | "block_some" | "block_most" | "block_all";
    sensitiveContentThreshold?: "allow_all" | "allow_some" | "allow_none";
  };
}

/**
  * Model profile loader interface
  */
export interface ModelProfileLoader {
  loadProfile(type: ModelProfileType): Promise<ModelProfile>;
  getAvailableProfiles(): Promise<ModelProfileType[]>;
}

/**
  * Base model adapter implementation with retry logic
  */
export abstract class BaseModelAdapter implements ModelAdapter {
  abstract id: string;
  abstract supportsStreaming: boolean;
  eventBus: EventBus;
  config: ModelAdapterConfig;

  constructor(eventBus: EventBus, config: ModelAdapterConfig = {}) {
    this.eventBus = eventBus;
    this.config = {
      maxRetries: config.maxRetries ?? 5,
      retryIntervals: config.retryIntervals ?? [200, 500, 1000, 2000, 3000],
      timeoutMs: config.timeoutMs ?? 30000,
    };
  }

  /**
    * Generate with retry logic
    */
  async generate(input: ModelInput): Promise<Result<ModelOutput, ModelError>> {
    const { maxRetries, retryIntervals } = this.config;
    let lastError: ModelError | null = null;

    for (let attempt = 0; attempt < maxRetries!; attempt++) {
      try {
        const result = await this.generateOnce(input);
        
        // Emit telemetry event
        this.eventBus.emit("ModelResponseEvent", {
          modelId: this.id,
          input,
          output: result,
          attempt,
          success: true,
        });
  
        return { ok: true, value: result };
      } catch (error) {
        lastError = this.handleError(error, attempt);
        
        // Emit error event
        this.eventBus.emit("ModelErrorEvent", {
          modelId: this.id,
          input,
          error: lastError,
          attempt,
        });
  
        // Check if we should retry
        if (!this.shouldRetry(lastError, attempt)) {
          break;
        }
  
        // Wait before retry
        if (attempt < maxRetries! - 1) {
          const delay = retryIntervals![attempt] || 1000;
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    return { ok: false, error: lastError! };
  }

  /**
    * Single attempt generation
    */
  protected abstract generateOnce(input: ModelInput): Promise<ModelOutput>;

  /**
    * Handle errors and convert to ModelError
    */
  protected handleError(error: unknown, attempt: number): ModelError {
    if (error instanceof ModelError) {
      return error;
    }

    if (error instanceof Error) {
      return new ModelError(error.message, this.id, error);
    }

    return new ModelError("Unknown model error", this.id);
  }

  /**
    * Determine if error is retryable
    */
  protected shouldRetry(error: ModelError, attempt: number): boolean {
    // Don't retry on non-transient errors
    if (error.code === "validation_error" || error.code === "permission_error") {
      return false;
    }

    // Retry transient errors (network, rate limit, server overload)
    const transientErrors = ["rate_limit_error", "network_error", "server_overload"];
    return transientErrors.includes(error.code);
  }
}

/**
  * Model input validation schema
  */
export const ModelInputSchema = z.object({
  prompt: z.string(),
  context: z.array(z.string()).optional(),
  options: z
    .object({
      temperature: z.number().min(0).max(1).optional(),
      max_tokens: z.number().int().positive().optional(),
      tools: z.array(
        z.object({
          type: z.literal("function"),
          function: z.object({
            name: z.string(),
            description: z.string().optional(),
            parameters: z.record(z.unknown()).optional(),
          }),
        })
      ).optional(),
      tool_choice: z
        .union([
          z.literal("auto"),
          z.literal("none"),
          z.object({
            type: z.literal("function"),
            function: z.object({ name: z.string() }),
          }),
        ])
        .optional(),
    })
    .optional(),
});

/**
  * Model output validation schema
  */
export const ModelOutputSchema = z.object({
  type: z.union([z.literal("final"), z.literal("tool")]),
  content: z.string().optional(),
  tool: z.string().optional(),
  arguments: z.record(z.unknown()).optional(),
  usage: z
    .object({
      prompt_tokens: z.number().int().nonnegative().optional(),
      completion_tokens: z.number().int().nonnegative().optional(),
      total_tokens: z.number().int().nonnegative().optional(),
    })
    .optional(),
});

/**
  * Model chunk validation schema
  */
export const ModelChunkSchema = z.object({
  content: z.string(),
  usage: z
    .object({
      prompt_tokens: z.number().int().nonnegative().optional(),
      completion_tokens: z.number().int().nonnegative().optional(),
    })
    .optional(),
});

/**
  * Default ModelProfileLoader implementation
  */
export class DefaultModelProfileLoader implements ModelProfileLoader {
  private profiles: Record<ModelProfileType, ModelProfile>;

  constructor(profiles?: Record<ModelProfileType, Partial<ModelProfile>>) {
    this.profiles = {
      fast: {
        type: "fast",
        modelName: "gpt-3.5-turbo",
        temperature: 0.7,
        max_tokens: 4096,
        safetySettings: {
          harmfulContentThreshold: "block_some",
          sensitiveContentThreshold: "allow_some",
        },
        ...profiles?.fast,
      },
      smart: {
        type: "smart",
        modelName: "gpt-4",
        temperature: 0.9,
        max_tokens: 8192,
        safetySettings: {
          harmfulContentThreshold: "block_most",
          sensitiveContentThreshold: "allow_some",
        },
        ...profiles?.smart,
      },
      cheap: {
        type: "cheap",
        modelName: "gpt-3.5-turbo",
        temperature: 0.5,
        max_tokens: 2048,
        safetySettings: {
          harmfulContentThreshold: "block_some",
          sensitiveContentThreshold: "allow_none",
        },
        ...profiles?.cheap,
      },
      secure: {
        type: "secure",
        modelName: "gpt-4",
        temperature: 0.3,
        max_tokens: 4096,
        safetySettings: {
          harmfulContentThreshold: "block_all",
          sensitiveContentThreshold: "allow_none",
        },
        ...profiles?.secure,
      },
    };
  }

  async loadProfile(type: ModelProfileType): Promise<ModelProfile> {
    const profile = this.profiles[type];
    if (!profile) {
      throw new Error(`Profile ${type} not found`);
    }
    return profile;
  }

  async getAvailableProfiles(): Promise<ModelProfileType[]> {
    return Object.keys(this.profiles) as ModelProfileType[];
  }
}

/**
  * Model profile validation schema
  */
export const ModelProfileSchema = z.object({
  type: z.union([
    z.literal("fast"),
    z.literal("smart"),
    z.literal("cheap"),
    z.literal("secure"),
  ]),
  modelName: z.string(),
  temperature: z.number().min(0).max(1),
  max_tokens: z.number().int().positive(),
  safetySettings: z
    .object({
      harmfulContentThreshold: z
        .union([
          z.literal("block_none"),
          z.literal("block_some"),
          z.literal("block_most"),
          z.literal("block_all"),
        ])
        .optional(),
      sensitiveContentThreshold: z
        .union([
          z.literal("allow_all"),
          z.literal("allow_some"),
          z.literal("allow_none"),
        ])
        .optional(),
    })
    .optional(),
});

