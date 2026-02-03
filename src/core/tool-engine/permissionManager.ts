/**
 * Permission Manager for Tool Engine
 * Centralized permission checking and management
 * 
 * Author: Bogdan Marcen & ChatGPT 5.1
 */

import { Permission, isAllowed, getMissingPermissions } from "../agent/permissions";
import { EventBus } from "../eventBus";

export interface PermissionCheckResult {
  allowed: boolean;
  missing?: Permission[];
  reason?: string;
}

export class PermissionManager {
  constructor(private eventBus: EventBus) {}

  /**
   * Check if caller has required permissions for a tool
   * Emits SecurityEvent on violations
   */
  checkPermissions(
    required: Permission[],
    granted: Permission[],
    context: {
      toolId: string;
      callerId: string;
    }
  ): PermissionCheckResult {
    if (required.length === 0) {
      // No permissions required
      return { allowed: true };
    }

    if (!granted || granted.length === 0) {
      // No permissions granted
      this.emitSecurityEvent("permission_denied", {
        toolId: context.toolId,
        callerId: context.callerId,
        missingPermissions: required,
        reason: "no_permissions_granted",
      });
      return {
        allowed: false,
        missing: required,
        reason: "no_permissions_granted",
      };
    }

    const missing = getMissingPermissions(required, granted);
    if (missing.length > 0) {
      // Missing some required permissions
      this.emitSecurityEvent("permission_denied", {
        toolId: context.toolId,
        callerId: context.callerId,
        missingPermissions: missing,
        reason: "insufficient_permissions",
      });
      return {
        allowed: false,
        missing,
        reason: "insufficient_permissions",
      };
    }

    // All permissions present
    return { allowed: true };
  }

  /**
   * Emit security event for audit logging
   */
  private emitSecurityEvent(
    type: string,
    details: {
      toolId: string;
      callerId: string;
      missingPermissions?: Permission[];
      reason?: string;
    }
  ): void {
    this.eventBus.emit("SecurityEvent", {
      type,
      ...details,
      timestamp: Date.now(),
    });
  }

  /**
   * Validate permission strings are valid Permission types
   */
  static validatePermissionStrings(permissions: string[]): Permission[] {
    const validPermissions: Permission[] = [
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

    const invalid: string[] = [];
    const valid: Permission[] = [];

    for (const perm of permissions) {
      if (validPermissions.includes(perm as Permission)) {
        valid.push(perm as Permission);
      } else {
        invalid.push(perm);
      }
    }

    if (invalid.length > 0) {
      console.warn(
        `[PermissionManager] Invalid permissions detected: ${invalid.join(", ")}`
      );
    }

    return valid;
  }
}

