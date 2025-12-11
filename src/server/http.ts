import express from "express";
import cors from "cors";
import bodyParser from "body-parser";

// Rate limiting (simple in-memory implementation)
// In production, use redis-based rate limiting
interface RateLimitStore {
  [key: string]: { count: number; resetTime: number };
}

class SimpleRateLimiter {
  private store: RateLimitStore = {};
  private windowMs: number;
  private maxRequests: number;

  constructor(windowMs: number, maxRequests: number) {
    this.windowMs = windowMs;
    this.maxRequests = maxRequests;
  }

  check(identifier: string): { allowed: boolean; remaining: number; resetTime: number } {
    const now = Date.now();
    const key = identifier;
    const entry = this.store[key];

    if (!entry || now > entry.resetTime) {
      // New window
      this.store[key] = {
        count: 1,
        resetTime: now + this.windowMs,
      };
      return {
        allowed: true,
        remaining: this.maxRequests - 1,
        resetTime: now + this.windowMs,
      };
    }

    if (entry.count >= this.maxRequests) {
      return {
        allowed: false,
        remaining: 0,
        resetTime: entry.resetTime,
      };
    }

    entry.count++;
    return {
      allowed: true,
      remaining: this.maxRequests - entry.count,
      resetTime: entry.resetTime,
    };
  }

  // Clean up old entries periodically
  cleanup() {
    const now = Date.now();
    for (const key in this.store) {
      if (this.store[key].resetTime < now) {
        delete this.store[key];
      }
    }
  }
}

// Create rate limiter: 100 requests per 15 minutes per IP
const rateLimiter = new SimpleRateLimiter(15 * 60 * 1000, 100);

// Cleanup every 5 minutes
setInterval(() => rateLimiter.cleanup(), 5 * 60 * 1000);

export function createHttpServer(deps: any) {
  const app = express();
  
  // CORS configuration
  const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(",") || ["http://localhost:3000"];
  app.use(cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
  }));
  
  app.use(bodyParser.json());

  // Rate limiting middleware
  app.use((req, res, next) => {
    const identifier = req.ip || req.socket.remoteAddress || "unknown";
    const result = rateLimiter.check(identifier);

    if (!result.allowed) {
      return res.status(429).json({
        error: "Too many requests",
        message: "Rate limit exceeded. Please try again later.",
        resetTime: result.resetTime,
      });
    }

    // Add rate limit headers
    res.setHeader("X-RateLimit-Limit", rateLimiter["maxRequests"]);
    res.setHeader("X-RateLimit-Remaining", result.remaining);
    res.setHeader("X-RateLimit-Reset", new Date(result.resetTime).toISOString());

    next();
  });

  // register route modules
  app.use("/agent", deps.routes.agent);
  app.use("/vfs", deps.routes.vfs);
  app.use("/events", deps.routes.events);
  app.use("/tools", deps.routes.tools);

  return app;
}

