/**
 * Model Profile Loader Implementation
 * Loads model profiles from configuration files
 *
 * Author: Bogdan Marcen & ChatGPT 5.1
 */

import { readFile } from "fs/promises";
import { resolve } from "path";
import { ModelProfile, ModelProfileType, ModelProfileLoader, ModelProfileSchema } from "./adapter";
import { z } from "zod";

/**
 * File-based Model Profile Loader
 */
export class FileModelProfileLoader implements ModelProfileLoader {
  private profiles: Record<ModelProfileType, ModelProfile>;
  private configPath: string;

  constructor(configPath: string = "config/modelProfiles.json") {
    this.configPath = resolve(configPath);
    this.profiles = {} as Record<ModelProfileType, ModelProfile>;
  }

  /**
   * Load and initialize profiles from file
   */
  async initialize(): Promise<void> {
    try {
      const configContent = await readFile(this.configPath, "utf-8");
      const config = JSON.parse(configContent);

      // Validate and load profiles
      for (const [type, profileData] of Object.entries(config)) {
        const profileWithType = {
          type: type as ModelProfileType,
          modelName: (profileData as any).modelName,
          temperature: (profileData as any).temperature,
          max_tokens: (profileData as any).max_tokens,
          safetySettings: (profileData as any).safetySettings,
        };
        const validated = ModelProfileSchema.parse(profileWithType);
        this.profiles[type as ModelProfileType] = validated;
      }
    } catch (error) {
      console.error("Failed to load model profiles:", error);
      // Fallback to default profiles
      const defaultLoader = new DefaultModelProfileLoader();
      for (const type of await defaultLoader.getAvailableProfiles()) {
        this.profiles[type] = await defaultLoader.loadProfile(type);
      }
    }
  }

  async loadProfile(type: ModelProfileType): Promise<ModelProfile> {
    if (!this.profiles[type]) {
      throw new Error(`Profile ${type} not loaded`);
    }
    return this.profiles[type];
  }

  async getAvailableProfiles(): Promise<ModelProfileType[]> {
    return Object.keys(this.profiles) as ModelProfileType[];
  }

  /**
   * Get all loaded profiles
   */
  getAllProfiles(): Record<ModelProfileType, ModelProfile> {
    return { ...this.profiles };
  }
}

/**
 * Default Model Profile Loader (fallback)
 */
export class DefaultModelProfileLoader implements ModelProfileLoader {
  private profiles: Record<ModelProfileType, ModelProfile>;

  constructor() {
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
 * Model profile configuration schema
 */
export const ModelProfilesConfigSchema = z.record(
  z.union([
    z.literal("fast"),
    z.literal("smart"),
    z.literal("cheap"),
    z.literal("secure"),
  ]),
  z.object({
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
  })
);