/**
 * Permissions system with principle of least privilege
 * 
 * Author: Bogdan Marcen & ChatGPT 5.1
 */

export type Permission =
  | "vfs.read"
  | "vfs.write"
  | "vfs.delete"
  | "net.fetch"
  | "process.execute"
  | "python.execute"
  | "js.execute"
  | "tool.run"
  | "model.call";

export interface AgentPermissionsConfig {
  defaultPermissions: Permission[];
  roles?: Record<string, Permission[]>;
}

/**
 * Default least privilege permissions - agents only get read access by default
 */
export const DEFAULT_LEAST_PRIVILEGE: Permission[] = ["vfs.read"];

/**
 * Full permissions for trusted agents (use with caution)
 */
export const FULL_PERMISSIONS: Permission[] = [
  "vfs.read",
  "vfs.write",
  "vfs.delete",
  "net.fetch",
  "process.execute",
  "python.execute",
  "js.execute",
  "tool.run",
  "model.call",
];

/**
 * Check if required permissions are granted
 */
export function isAllowed(
  required: Permission[],
  granted: Permission[]
): boolean {
  return required.every((r) => granted.includes(r));
}

/**
 * Get missing permissions
 */
export function getMissingPermissions(
  required: Permission[],
  granted: Permission[]
): Permission[] {
  return required.filter((r) => !granted.includes(r));
}

/**
 * Merge permissions from roles
 */
export function mergePermissions(
  base: Permission[],
  roles: string[],
  roleMap: Record<string, Permission[]>
): Permission[] {
  const merged = new Set<Permission>(base);
  for (const role of roles) {
    const rolePerms = roleMap[role];
    if (rolePerms) {
      for (const perm of rolePerms) {
        merged.add(perm);
      }
    }
  }
  return Array.from(merged);
}
