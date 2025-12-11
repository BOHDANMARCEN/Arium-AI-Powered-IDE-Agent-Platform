/**
 * Secure path resolution utilities
 * Prevents path traversal attacks and ensures paths stay within base directory
 * 
 * Author: Bogdan Marcen & ChatGPT 5.1
 */

import path from "path";
import { PathTraversalError } from "../errors";

/**
 * Securely resolve a user-provided path relative to a base directory
 * 
 * Requirements:
 * - Reject absolute paths
 * - Normalize via path.resolve()
 * - Ensure resolved path starts with basePath
 * - Reject "..", encoded traversal (%2e%2e%2f)
 * - Reject null bytes
 * 
 * @param basePath - The base directory (must be absolute)
 * @param userPath - User-provided relative path
 * @returns Resolved relative path (safe to use)
 * @throws PathTraversalError if path is invalid or attempts traversal
 */
export function secureResolvePath(basePath: string, userPath: string): string {
  // Validate basePath is absolute
  if (!path.isAbsolute(basePath)) {
    throw new Error("basePath must be an absolute path");
  }

  // Validate userPath is a string
  if (!userPath || typeof userPath !== "string") {
    throw new PathTraversalError("Empty or invalid path");
  }

  // Reject null bytes
  if (userPath.includes("\0")) {
    throw new PathTraversalError("Path contains null bytes");
  }

  // Decode URI-encoded input (handles %2e%2e%2f, etc.)
  let decoded: string;
  try {
    decoded = decodeURIComponent(userPath);
  } catch {
    decoded = userPath; // If decoding fails, use original
  }

  // Check for absolute paths BEFORE cleaning (to catch Unix / paths)
  if (decoded.startsWith("/") || decoded.match(/^[A-Z]:[\\/]/i)) {
    throw new PathTraversalError("Absolute paths not allowed");
  }

  // Remove leading slashes and normalize
  const cleaned = decoded.replace(/^[/\\]+/, "");

  // Double-check absolute paths after cleaning
  if (path.isAbsolute(cleaned)) {
    throw new PathTraversalError("Absolute paths not allowed");
  }

  // Check for traversal sequences (including encoded)
  // Check for .. before normalization
  if (cleaned.includes("..")) {
    throw new PathTraversalError("Path traversal sequences not allowed");
  }
  
  // Check for encoded traversal
  if (cleaned.match(/%2e|%2f|%5c/i)) {
    throw new PathTraversalError("Encoded traversal sequences not allowed");
  }

  // Normalize via path.resolve()
  const resolved = path.resolve(basePath, cleaned);
  const basePathResolved = path.resolve(basePath);

  // Ensure resolved path is within basePath
  // Use path.relative to check containment
  const relative = path.relative(basePathResolved, resolved);
  
  // If relative path starts with "..", it's outside the base
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new PathTraversalError("Path resolves outside base directory");
  }

  // Return the relative path (safe to use)
  return relative;
}

/**
 * Validate path length (max 1024 characters as per Phase 1.1)
 */
export function validatePathLength(userPath: string, maxLength: number = 1024): void {
  if (userPath.length > maxLength) {
    throw new PathTraversalError(`Path exceeds maximum length of ${maxLength} characters`);
  }
}

