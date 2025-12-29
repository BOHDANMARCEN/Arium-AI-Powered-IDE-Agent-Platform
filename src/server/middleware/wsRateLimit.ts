/**
 * Rate limiting for WebSocket handshake attempts
 * Prevents brute force attacks on WebSocket authentication
 * 
 * Author: Bogdan Marcen & ChatGPT 5.1
 */

interface RateLimitEntry {
  count: number;
  resetTime: number;
  blocked: boolean;
  blockUntil?: number;
}

class WebSocketHandshakeRateLimiter {
  private store: Map<string, RateLimitEntry> = new Map();
  private readonly maxAttempts: number;
  private readonly windowMs: number;
  private readonly blockDurationMs: number;

  constructor(
    maxAttempts: number = 5, // Max attempts per window
    windowMs: number = 60_000, // 1 minute window
    blockDurationMs: number = 300_000 // 5 minutes block
  ) {
    this.maxAttempts = maxAttempts;
    this.windowMs = windowMs;
    this.blockDurationMs = blockDurationMs;
  }

  /**
   * Check if handshake attempt is allowed
   * @param identifier - IP address or user ID
   * @returns { allowed: boolean, remaining?: number, resetTime?: number, blockedUntil?: number }
   */
  check(identifier: string): {
    allowed: boolean;
    remaining?: number;
    resetTime?: number;
    blockedUntil?: number;
  } {
    const now = Date.now();
    const entry = this.store.get(identifier);

    // If entry doesn't exist, create new one
    if (!entry) {
      this.store.set(identifier, {
        count: 1,
        resetTime: now + this.windowMs,
        blocked: false,
      });
      return {
        allowed: true,
        remaining: this.maxAttempts - 1,
        resetTime: now + this.windowMs,
      };
    }

    // Check if currently blocked
    if (entry.blocked && entry.blockUntil && now < entry.blockUntil) {
      return {
        allowed: false,
        blockedUntil: entry.blockUntil,
      };
    }

    // If block expired, reset
    if (entry.blocked && entry.blockUntil && now >= entry.blockUntil) {
      entry.blocked = false;
      entry.count = 0;
      entry.resetTime = now + this.windowMs;
      entry.blockUntil = undefined;
    }

    // Check if window expired
    if (now > entry.resetTime) {
      entry.count = 1;
      entry.resetTime = now + this.windowMs;
      this.store.set(identifier, entry);
      return {
        allowed: true,
        remaining: this.maxAttempts - 1,
        resetTime: entry.resetTime,
      };
    }

    // Check if limit exceeded
    if (entry.count >= this.maxAttempts) {
      // Block for blockDurationMs
      entry.blocked = true;
      entry.blockUntil = now + this.blockDurationMs;
      this.store.set(identifier, entry);
      return {
        allowed: false,
        blockedUntil: entry.blockUntil,
      };
    }

    // Increment count
    entry.count++;
    this.store.set(identifier, entry);
    return {
      allowed: true,
      remaining: this.maxAttempts - entry.count,
      resetTime: entry.resetTime,
    };
  }

  /**
   * Record a failed authentication attempt
   */
  recordFailure(identifier: string): void {
    const result = this.check(identifier);
    if (!result.allowed) {
      // Already at limit, don't increment again
      return;
    }
    // The check already incremented, so we're done
  }

  /**
   * Cleanup old entries
   */
  cleanup(): void {
    const now = Date.now();
    const maxAge = this.windowMs * 2; // Keep entries for 2 windows
    for (const [key, entry] of this.store.entries()) {
      const isExpired =
        now > entry.resetTime + maxAge &&
        (!entry.blockUntil || now > entry.blockUntil);
      if (isExpired) {
        this.store.delete(key);
      }
    }
  }
}

// Create rate limiter instance
// Configurable via environment variables
const wsRateLimiter = new WebSocketHandshakeRateLimiter(
  parseInt(process.env.WS_RATE_LIMIT_MAX_ATTEMPTS || "5", 10),
  parseInt(process.env.WS_RATE_LIMIT_WINDOW_MS || "60000", 10),
  parseInt(process.env.WS_RATE_LIMIT_BLOCK_MS || "300000", 10)
);

// Cleanup every 5 minutes
setInterval(() => wsRateLimiter.cleanup(), 5 * 60 * 1000);

export { wsRateLimiter };

