/**
 * VFS Type Definitions
 * Phase 3.1: Type System Improvements
 * 
 * Author: Bogdan Marcen & ChatGPT 5.1
 */

export interface FileVersion {
  id: string;
  content: string;
  timestamp: number;
  author?: string;
  hash?: string;
  prev?: string;
}

export interface VFSReadResult {
  content: string;
  version?: FileVersion;
}

export interface VFSWriteResult {
  version: FileVersion;
  path: string;
}

export interface VFSDeleteResult {
  ok: boolean;
  path: string;
  error?: {
    message: string;
    path: string;
  };
}

export interface VFSSnapshot {
  id: string;
  timestamp: number;
  author?: string;
  state: Record<string, string>;
}

export interface VFSDiffResult {
  a: string | null;
  b: string | null;
  changes?: Array<{
    path: string;
    type: "added" | "deleted" | "modified";
    sizeA?: number;
    sizeB?: number;
  }>;
}

