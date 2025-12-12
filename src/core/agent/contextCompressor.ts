/**
 * Context Compressor for Arium 0.2.0
 * Handles context compression and summarization
 *
 * Author: Bogdan Marcen & ChatGPT 5.1
 */

import { EventBus } from "../eventBus";
import { ModelAdapter } from "../models/adapter";

/**
 * Context Compressor interface
 */
export interface ContextCompressor {
  compress(messages: AgentMessage[]): Promise<AgentMessage[]>;
}

/**
 * Agent message interface
 */
export interface AgentMessage {
  role: "user" | "assistant" | "system" | "tool" | "reasoning";
  content: string;
  meta?: Record<string, unknown>;
  timestamp?: number;
}

/**
 * Base context compressor implementation
 */
export class BaseContextCompressor implements ContextCompressor {
  protected eventBus: EventBus;
  protected model: ModelAdapter;
  protected maxContextSize: number;

  constructor(eventBus: EventBus, model: ModelAdapter, maxContextSize: number = 4096) {
    this.eventBus = eventBus;
    this.model = model;
    this.maxContextSize = maxContextSize;
  }

  /**
   * Main compression method
   */
  async compress(messages: AgentMessage[]): Promise<AgentMessage[]> {
    const startTime = Date.now();
    const originalSize = messages.length;

    // Skip compression if context is small
    if (messages.length <= 10) {
      return messages;
    }

    // Apply compression strategies
    let compressed = await this.applyCompressionStrategies(messages);

    const endTime = Date.now();
    const compressedSize = compressed.length;

    // Emit compression event
    this.eventBus.emit("ContextCompressionEvent" as any, {
      originalSize,
      compressedSize,
      compressionRatio: compressedSize / originalSize,
      executionTime: endTime - startTime,
      timestamp: endTime,
    });

    return compressed;
  }

  /**
   * Apply multiple compression strategies
   */
  protected async applyCompressionStrategies(messages: AgentMessage[]): Promise<AgentMessage[]> {
    // 1. Remove duplicate messages
    let result = this.removeDuplicates(messages);

    // 2. Group similar messages
    result = this.groupSimilarMessages(result);

    // 3. Summarize old messages
    result = await this.summarizeOldMessages(result);

    // 4. Apply limit awareness
    result = this.applyLimitAwareness(result);

    return result;
  }

  /**
   * Remove duplicate messages
   */
  protected removeDuplicates(messages: AgentMessage[]): AgentMessage[] {
    const seen = new Map<string, boolean>();
    const uniqueMessages: AgentMessage[] = [];

    for (const message of messages) {
      const key = `${message.role}:${message.content}`;
      if (!seen.has(key)) {
        seen.set(key, true);
        uniqueMessages.push(message);
      }
    }

    return uniqueMessages;
  }

  /**
   * Group similar messages
   */
  protected groupSimilarMessages(messages: AgentMessage[]): AgentMessage[] {
    // Simple grouping by role
    const grouped: AgentMessage[] = [];
    let currentGroup: AgentMessage | null = null;

    for (const message of messages) {
      if (currentGroup && currentGroup.role === message.role) {
        // Merge content
        currentGroup.content += "\n" + message.content;
      } else {
        if (currentGroup) {
          grouped.push(currentGroup);
        }
        currentGroup = { ...message };
      }
    }

    if (currentGroup) {
      grouped.push(currentGroup);
    }

    return grouped;
  }

  /**
   * Summarize old messages using model
   */
  protected async summarizeOldMessages(messages: AgentMessage[]): Promise<AgentMessage[]> {
    if (messages.length <= 20) {
      return messages;
    }

    // Take first 50% of messages for summarization
    const oldMessages = messages.slice(0, Math.floor(messages.length / 2));
    const recentMessages = messages.slice(Math.floor(messages.length / 2));

    try {
      const summaryResult = await this.model.generate({
        prompt: `Summarize these conversation messages concisely:\n\n${JSON.stringify(oldMessages)}\n\nSummary:`,
        context: [],
      });

      if (summaryResult.ok && summaryResult.value.content) {
        const summaryMessage: AgentMessage = {
          role: "system",
          content: `[SUMMARY OF PREVIOUS ${oldMessages.length} MESSAGES]: ${summaryResult.value.content}`,
          meta: {
            summarizedMessages: oldMessages.length,
            originalContent: oldMessages.map((m) => m.content).join("\n"),
          },
        };

        return [summaryMessage, ...recentMessages];
      }
    } catch (error) {
      console.warn("Context summarization failed:", error);
    }

    return messages;
  }

  /**
   * Apply limit awareness
   */
  protected applyLimitAwareness(messages: AgentMessage[]): AgentMessage[] {
    // Calculate token count (simple approximation)
    const tokenCount = messages.reduce((count, message) => {
      return count + Math.ceil(message.content.length / 4); // Approx 4 chars per token
    }, 0);

    // If over limit, truncate from the beginning
    if (tokenCount > this.maxContextSize) {
      const excess = tokenCount - this.maxContextSize;
      const charsToRemove = excess * 4; // Convert tokens back to chars

      let charsRemoved = 0;
      const result: AgentMessage[] = [];

      for (let i = messages.length - 1; i >= 0; i--) {
        const message = messages[i];
        const messageChars = message.content.length;

        if (charsRemoved + messageChars <= charsToRemove) {
          charsRemoved += messageChars;
          // Skip this message (it will be removed)
        } else {
          result.unshift(message);
        }
      }

      return result;
    }

    return messages;
  }

  /**
   * Get compression statistics
   */
  async getCompressionStats(
    original: AgentMessage[],
    compressed: AgentMessage[]
  ): Promise<{
    originalSize: number;
    compressedSize: number;
    compressionRatio: number;
    spaceSaved: number;
  }> {
    return {
      originalSize: original.length,
      compressedSize: compressed.length,
      compressionRatio: compressed.length / original.length,
      spaceSaved: original.length - compressed.length,
    };
  }
}

/**
 * Advanced context compressor with more sophisticated strategies
 */
export class AdvancedContextCompressor extends BaseContextCompressor {
  constructor(eventBus: EventBus, model: ModelAdapter, maxContextSize: number = 4096) {
    super(eventBus, model, maxContextSize);
  }

  /**
   * Enhanced compression with semantic analysis
   */
  protected async applyCompressionStrategies(messages: AgentMessage[]): Promise<AgentMessage[]> {
    // 1. Remove duplicates
    let result = this.removeDuplicates(messages);

    // 2. Identify and remove redundant information
    result = this.removeRedundantInformation(result);

    // 3. Semantic summarization
    result = await this.semanticSummarization(result);

    // 4. Apply limit awareness
    result = this.applyLimitAwareness(result);

    return result;
  }

  /**
   * Remove redundant information
   */
  protected removeRedundantInformation(messages: AgentMessage[]): AgentMessage[] {
    // Simple implementation: remove consecutive identical messages
    const filtered: AgentMessage[] = [];

    for (let i = 0; i < messages.length; i++) {
      const current = messages[i];
      const next = messages[i + 1];

      if (next && current.content === next.content && current.role === next.role) {
        // Skip duplicate
        continue;
      }

      filtered.push(current);
    }

    return filtered;
  }

  /**
   * Semantic summarization using model
   */
  protected async semanticSummarization(messages: AgentMessage[]): Promise<AgentMessage[]> {
    if (messages.length <= 15) {
      return messages;
    }

    // Group by conversation segments
    const segmentSize = Math.max(5, Math.floor(messages.length / 3));
    const segments: AgentMessage[][] = [];

    for (let i = 0; i < messages.length; i += segmentSize) {
      segments.push(messages.slice(i, i + segmentSize));
    }

    const summarizedSegments: AgentMessage[] = [];

    for (const segment of segments) {
      try {
        const summaryResult = await this.model.generate({
          prompt: `Summarize this conversation segment semantically:\n\n${JSON.stringify(segment)}\n\nKey points:`,
          context: [],
        });

        if (summaryResult.ok && summaryResult.value.content) {
          const summaryMessage: AgentMessage = {
            role: "system",
            content: `[SEGMENT SUMMARY]: ${summaryResult.value.content}`,
            meta: {
              originalMessages: segment.length,
              segmentIndex: segments.indexOf(segment),
            },
          };
          summarizedSegments.push(summaryMessage);
        } else {
          summarizedSegments.push(...segment);
        }
      } catch (error) {
        console.warn("Segment summarization failed:", error);
        summarizedSegments.push(...segment);
      }
    }

    return summarizedSegments;
  }

  /**
   * Condense old messages more aggressively
   */
  protected async summarizeOldMessages(messages: AgentMessage[]): Promise<AgentMessage[]> {
    if (messages.length <= 30) {
      return messages;
    }

    // Take first 66% of messages for summarization
    const oldMessages = messages.slice(0, Math.floor(messages.length * 0.66));
    const recentMessages = messages.slice(Math.floor(messages.length * 0.66));

    try {
      const summaryResult = await this.model.generate({
        prompt: `Create a comprehensive summary of this conversation history:\n\n${JSON.stringify(oldMessages)}\n\nFocus on key decisions, actions taken, and important information. Be concise but thorough:`,
        context: [],
      });

      if (summaryResult.ok && summaryResult.value.content) {
        const summaryMessage: AgentMessage = {
          role: "system",
          content: `[COMPREHENSIVE SUMMARY OF ${oldMessages.length} MESSAGES]: ${summaryResult.value.content}`,
          meta: {
            summarizedMessages: oldMessages.length,
            compressionMethod: "advanced",
          },
        };

        return [summaryMessage, ...recentMessages];
      }
    } catch (error) {
      console.warn("Advanced context summarization failed:", error);
    }

    return messages;
  }
}

/**
 * Context Compressor Factory
 */
export class ContextCompressorFactory {
  static createCompressor(
    type: "basic" | "advanced" = "basic",
    eventBus: EventBus,
    model: ModelAdapter,
    maxContextSize: number = 4096
  ): ContextCompressor {
    switch (type) {
      case "basic":
        return new BaseContextCompressor(eventBus, model, maxContextSize);
      case "advanced":
        return new AdvancedContextCompressor(eventBus, model, maxContextSize);
      default:
        throw new Error(`Unknown compressor type: ${type}`);
    }
  }

  static createAutoCompressor(
    eventBus: EventBus,
    model: ModelAdapter,
    maxContextSize: number = 4096
  ): ContextCompressor {
    // Auto-select based on model capabilities
    const modelName = model.id.toLowerCase();
    if (modelName.includes("gpt-4") || modelName.includes("advanced")) {
      return new AdvancedContextCompressor(eventBus, model, maxContextSize);
    }
    return new BaseContextCompressor(eventBus, model, maxContextSize);
  }
}