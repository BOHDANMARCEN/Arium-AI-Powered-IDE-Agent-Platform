/**
 * JWT Authentication utilities
 * 
 * Author: Bogdan Marcen & ChatGPT 5.1
 */

import jwt from "jsonwebtoken";

export interface JWTPayload {
  id: string;
  permissions?: string[];
  roles?: string[];
  [key: string]: any;
}

/**
 * Sign a JWT token
 */
export function signToken(
  payload: JWTPayload,
  secret: string,
  opts?: jwt.SignOptions
): string {
  return jwt.sign(payload, secret, {
    expiresIn: "1h",
    ...opts,
  });
}

/**
 * Verify and decode a JWT token
 */
export function verifyToken(token: string, secret: string): JWTPayload {
  try {
    const decoded = jwt.verify(token, secret);
    return decoded as JWTPayload;
  } catch (err: any) {
    if (err.name === "TokenExpiredError") {
      throw new Error("Token expired");
    }
    if (err.name === "JsonWebTokenError") {
      throw new Error("Invalid token");
    }
    throw new Error("Invalid or expired token");
  }
}

/**
 * Get JWT secret from environment
 */
export function getJWTSecret(): string {
  const secret = process.env.WS_JWT_SECRET || process.env.JWT_SECRET;
  if (!secret || secret === "please-change-me") {
    console.warn(
      "[AUTH] WARNING: Using default JWT secret. Set WS_JWT_SECRET in production!"
    );
    return "please-change-me";
  }
  return secret;
}

/**
 * Extract token from request (query string or headers)
 */
export function extractToken(req: {
  headers: any;
  url?: string | null;
}): string | null {
  // Try query parameter first
  if (req.url) {
    try {
      const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
      const token = url.searchParams.get("token");
      if (token) return token;
    } catch {
      // Invalid URL, continue
    }
  }

  // Try Authorization header (Bearer token)
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    return authHeader.substring(7);
  }

  // Try sec-websocket-protocol header (for WebSocket)
  const protocol = req.headers["sec-websocket-protocol"];
  if (protocol && typeof protocol === "string") {
    return protocol;
  }

  return null;
}
