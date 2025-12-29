/**
 * BoundedContext: sliding-window context with max tokens
 * Prevents unbounded memory growth by evicting old messages
 * 
 * Author: Bogdan Marcen & ChatGPT 5.1
 */

export interface ContextMessage {
  role: "system" | "user" | "assistant" | "tool";
  content?: string;
  tool?: string;
  toolCallId?: string;
  name?: string;
  [key: string]: unknown;
}

export interface BoundedContextConfig {
  maxTokens: number; // Maximum total tokens across all messages
  maxMessages?: number; // Maximum number of messages (fallback)
  tokenCounter?: (message: ContextMessage) => number; // Custom token counter
}

export interface BoundedContextMetrics {
  totalMessages: number;
  currentTokens: number;
  droppedMessages: number;
  lastEviction?: number; // Timestamp of last eviction
}

/**
 * Simple token counter (approximation: ~4 chars per token)
 * For production, use tiktoken or similar
 */
function defaultTokenCounter(message: ContextMessage): number {
  const content = JSON.stringify(message);
  // Rough approximation: 1 token ≈ 4 characters
  return Math.ceil(content.length / 4);
}

export class BoundedContext {
  private messages: ContextMessage[] = [];
  private currentTokens: number = 0;
  private droppedMessages: number = 0;
  private lastEviction: number | undefined;
  private maxTokens: number;
  private maxMessages: number;
  private tokenCounter: (message: ContextMessage) => number;

  constructor(config: BoundedContextConfig) {
    this.maxTokens = config.maxTokens;
    this.maxMessages = config.maxMessages ?? 100; // Fallback limit
    this.tokenCounter = config.tokenCounter ?? defaultTokenCounter;
  }

  /**
   * Add a message to context, evicting old messages if needed
   */
  add(message: ContextMessage): void {
    const messageTokens = this.tokenCounter(message);
    
    // Always keep system messages
    const isSystemMessage = message.role === "system";
    
    // Evict old messages if we exceed token limit
    while (
      this.currentTokens + messageTokens > this.maxTokens &&
      this.messages.length > 0 &&
      !isSystemMessage
    ) {
      // Don't evict system messages
      const evicted = this.messages.findIndex((m) => m.role !== "system");
      if (evicted === -1) {
        // Only system messages left, can't evict more
        break;
      }
      
      const evictedMessage = this.messages.splice(evicted, 1)[0];
      this.currentTokens -= this.tokenCounter(evictedMessage);
      this.droppedMessages++;
      this.lastEviction = Date.now();
    }

    // Fallback: enforce max messages limit
    if (this.messages.length >= this.maxMessages && !isSystemMessage) {
      const evicted = this.messages.findIndex((m) => m.role !== "system");
      if (evicted !== -1) {
        const evictedMessage = this.messages.splice(evicted, 1)[0];
        this.currentTokens -= this.tokenCounter(evictedMessage);
        this.droppedMessages++;
        this.lastEviction = Date.now();
      }
    }

    // Add new message
    this.messages.push(message);
    this.currentTokens += messageTokens;
  }

  /**
   * Add multiple messages at once
   */
  addBatch(messages: ContextMessage[]): void {
    for (const message of messages) {
      this.add(message);
    }
  }

  /**
   * Get all messages (read-only)
   */
  getAll(): readonly ContextMessage[] {
    return [...this.messages];
  }

  /**
   * Get messages as array (for compatibility)
   */
  toArray(): ContextMessage[] {
    return [...this.messages];
  }

  /**
   * Clear all messages (except system messages)
   */
  clear(): void {
    const systemMessages = this.messages.filter((m) => m.role === "system");
    this.messages = systemMessages;
    this.currentTokens = systemMessages.reduce(
      (sum, m) => sum + this.tokenCounter(m),
      0
    );
  }

  /**
   * Summarize old messages and replace with summary
   * This is a fallback when eviction isn't enough
   */
  summarize(keepRecent: number = 10): ContextMessage {
    if (this.messages.length <= keepRecent) {
      // Nothing to summarize
      return {
        role: "system",
        content: "No summarization needed",
      };
    }

    const systemMessages = this.messages.filter((m) => m.role === "system");
    const recentMessages = this.messages.slice(-keepRecent);
    const toSummarize = this.messages.slice(
      systemMessages.length,
      -keepRecent
    );

    // Create summary message
    const summary: ContextMessage = {
      role: "system",
      content: `Previous ${toSummarize.length} messages summarized`,
      type: "context_summary",
      originalCount: toSummarize.length,
      summarizedTokens: toSummarize.reduce(
        (sum, m) => sum + this.tokenCounter(m),
        0
      ),
    };

    // Rebuild context: system + summary + recent
    this.messages = [...systemMessages, summary, ...recentMessages];
    this.currentTokens = this.messages.reduce(
      (sum, m) => sum + this.tokenCounter(m),
      0
    );

    return summary;
  }

  /**
   * Get current metrics
   */
  getMetrics(): BoundedContextMetrics {
    return {
      totalMessages: this.messages.length,
      currentTokens: this.currentTokens,
      droppedMessages: this.droppedMessages,
      lastEviction: this.lastEviction,
    };
  }

  /**
   * Get remaining token capacity
   */
  getRemainingTokens(): number {
    return Math.max(0, this.maxTokens - this.currentTokens);
  }

  /**
   * Check if context is near capacity
   */
  isNearCapacity(threshold: number = 0.9): boolean {
    return this.currentTokens >= this.maxTokens * threshold;
  }
}

