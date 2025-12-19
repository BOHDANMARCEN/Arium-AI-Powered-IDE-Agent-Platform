# Security Hardening Implementation

**Author:** Bogdan Marcen & ChatGPT 5.1  
**Date:** 2025-12-11  
**Status:** ✅ Completed

---

## Overview

This document describes the security hardening improvements implemented in the Arium project based on the comprehensive audit report. All critical and high-priority security issues have been addressed.

---

## Implemented Changes

### 1. ✅ JS Runner Hardening (`src/core/tool-engine/runners/jsRunner.ts`)

**Changes:**
- ✅ Removed dangerous globals (Buffer, process, require)
- ✅ Strict VM2 sandbox configuration with `console: "off"`
- ✅ Static code validation for forbidden patterns
- ✅ Result sanitization (JSON-safe only)
- ✅ Code size limits (20KB max)
- ✅ Enhanced error handling (no sensitive stack traces in production)

**Security Features:**
- Forbidden patterns detection: `child_process`, `spawn`, `exec`, `eval`, `Function`, `process.`, `require()`, infinite loops
- Timeout protection (configurable, default 30s)
- Memory limit configuration (pseudo-limit for monitoring)

**Files Modified:**
- `src/core/tool-engine/runners/jsRunner.ts` - Complete rewrite with strict security

---

### 2. ✅ JWT Authentication for WebSocket (`src/server/websocket.ts`, `src/server/auth.ts`)

**Changes:**
- ✅ JWT token-based authentication
- ✅ Token extraction from headers (Bearer) and query string
- ✅ Token verification with proper error handling
- ✅ Auth payload attached to WebSocket connections
- ✅ Security events emitted on auth failures

**New Files:**
- `src/server/auth.ts` - JWT utilities (sign, verify, extract)

**Security Features:**
- Configurable JWT secret via `WS_JWT_SECRET` or `JWT_SECRET`
- Token expiration (default 1 hour)
- Proper error handling for expired/invalid tokens
- Backward compatibility with token-based auth

**Environment Variables:**
```env
WS_JWT_SECRET=your-secret-key-here
JWT_SECRET=your-secret-key-here  # Alternative
WS_REQUIRE_AUTH=true  # Default: true
```

---

### 3. ✅ Least Privilege Permissions System (`src/core/agent/permissions.ts`)

**Changes:**
- ✅ Type-safe permission system
- ✅ Default least privilege (only `vfs.read` by default)
- ✅ Permission checking utilities
- ✅ Predefined permission sets for common agent types

**New Files:**
- `src/core/agent/permissions.ts` - Permission types and utilities

**Permission Types:**
- `vfs.read`, `vfs.write`, `vfs.delete`
- `net.fetch`
- `process.execute`
- `python.execute`, `js.execute`
- `tool.run`, `model.call`

**Permission Sets:**
- `readOnly` - Only read access
- `codeAssistant` - Read, write, JS execution
- `trustedCI` - Read, write, process execution
- `fullAccess` - All permissions (use with caution)

**Files Modified:**
- `src/core/agent/agentCore.ts` - Uses least privilege by default

---

### 4. ✅ Tool Code Validation & Rate Limiting (`src/core/tool-engine/index.ts`)

**Changes:**
- ✅ Static code validation before registration
- ✅ Forbidden patterns detection
- ✅ Code size limits (20KB)
- ✅ Enhanced rate limiting (token bucket algorithm)
- ✅ Rate limit cleanup (prevents memory leaks)

**Security Features:**
- Pattern matching for dangerous code:
  - `child_process`, `spawn`, `exec`, `fork`, `process.`
  - `require()` calls
  - Infinite loops (`while(true)`)
  - `eval()`, `Function()` constructor
- Rate limiting: 10 calls/second per caller (configurable)
- Automatic cleanup of old rate limit entries

**Configuration:**
```env
TOOL_RATE_LIMIT_PER_SEC=10  # Calls per second
TOOL_RATE_LIMIT_CAPACITY=20  # Token bucket capacity
TOOL_RATE_LIMIT_REFILL_MS=1000  # Refill interval
```

---

### 5. ✅ VFS Path Traversal Protection (Already Implemented)

**Status:** ✅ Already comprehensive

**Existing Protection:**
- ✅ Path resolution with boundary checks
- ✅ Null byte rejection
- ✅ Encoded traversal detection (`%2e`, `%2f`, `%5c`)
- ✅ Absolute path rejection
- ✅ Atomic file writes

**Files:**
- `src/core/vfs/index.ts` - In-memory VFS protection
- `src/core/storage/persistentVFS.ts` - Persistent VFS protection

---

### 6. ✅ Comprehensive Security Tests (`tests/security.test.ts`)

**New Test File:**
- `tests/security.test.ts` - Comprehensive security test suite

**Test Coverage:**
- ✅ JS Runner security (forbidden patterns, size limits)
- ✅ VFS path traversal protection
- ✅ Permission system validation
- ✅ JWT authentication
- ✅ Tool Engine security (validation, rate limiting, permissions)

**Test Cases:**
1. JS Runner rejects `child_process`, `process.exit`, `eval`, `Function`
2. JS Runner rejects code > 20KB
3. VFS rejects `../etc/passwd`, absolute paths, null bytes
4. Permission system correctly checks permissions
5. JWT sign/verify works correctly
6. Tool Engine rejects malicious code
7. Rate limiting enforced
8. Permission enforcement works

---

## Security Improvements Summary

### Before:
- ❌ JS Runner had access to dangerous globals
- ❌ WebSocket used simple token (no JWT)
- ❌ Agents had all permissions by default
- ❌ No code validation before tool registration
- ❌ Basic rate limiting only

### After:
- ✅ Strict JS sandbox (no dangerous globals)
- ✅ JWT-based WebSocket authentication
- ✅ Least privilege permissions (read-only by default)
- ✅ Comprehensive code validation
- ✅ Enhanced rate limiting with cleanup
- ✅ Comprehensive security tests

---

## Migration Guide

### 1. Update Environment Variables

Add to `.env`:
```env
# JWT Authentication
WS_JWT_SECRET=your-secure-random-secret-here
JWT_SECRET=your-secure-random-secret-here
WS_REQUIRE_AUTH=true

# Rate Limiting
TOOL_RATE_LIMIT_PER_SEC=10
TOOL_RATE_LIMIT_CAPACITY=20
TOOL_RATE_LIMIT_REFILL_MS=1000
```

### 2. Update Agent Configurations

Agents now use least privilege by default. If your agents need more permissions, explicitly set them:

```typescript
const agent = new AgentCore(
  {
    id: "my-agent",
    permissions: ["vfs.read", "vfs.write", "js.execute"], // Explicit permissions
    // ... other config
  },
  eventBus,
  toolEngine
);
```

### 3. WebSocket Client Updates

Clients must now provide JWT tokens:

```javascript
// Generate token (server-side)
const token = signToken({ id: "user123", permissions: ["vfs.read"] }, secret);

// Connect with token
const ws = new WebSocket(`ws://localhost:4000?token=${token}`);
// Or use Authorization header
const ws = new WebSocket("ws://localhost:4000", {
  headers: { Authorization: `Bearer ${token}` }
});
```

### 4. Tool Registration

Tool code is now validated before registration. Ensure your tool code:
- Doesn't contain forbidden patterns
- Is under 20KB
- Follows safe coding practices

---

## Testing

Run security tests:
```bash
npm test -- tests/security.test.ts
```

Run all tests:
```bash
npm test
```

---

## Next Steps (Future Improvements)

1. **VM2 Alternatives:** Evaluate `isolated-vm` or `worker_threads` for better isolation
2. **Python Runner:** Add resource limits (memory/CPU) using cgroups or Docker
3. **Network Isolation:** Isolate Python/JS runners from network access
4. **Redis Rate Limiting:** Migrate to Redis-based rate limiting for production
5. **Circuit Breaker:** Implement circuit breaker pattern for model adapters
6. **Security Monitoring:** Add SIEM integration and security event logging

---

## Files Changed

### New Files:
- `src/server/auth.ts` - JWT authentication utilities
- `src/core/agent/permissions.ts` - Permission system
- `tests/security.test.ts` - Security test suite
- `SECURITY_HARDENING.md` - This document

### Modified Files:
- `src/core/tool-engine/runners/jsRunner.ts` - Hardened sandbox
- `src/server/websocket.ts` - JWT authentication
- `src/core/agent/agentCore.ts` - Least privilege permissions
- `src/core/tool-engine/index.ts` - Code validation & rate limiting

---

## Verification Checklist

- [x] TypeScript compiles without errors
- [x] All security tests pass
- [x] JS Runner blocks dangerous code
- [x] WebSocket requires JWT authentication
- [x] Agents use least privilege by default
- [x] Tool code validation works
- [x] Rate limiting enforced
- [x] VFS path traversal protection verified

---

## Conclusion

All critical and high-priority security issues from the audit have been addressed. The system now implements:

- ✅ Strict code sandboxing
- ✅ JWT-based authentication
- ✅ Least privilege permissions
- ✅ Comprehensive input validation
- ✅ Enhanced rate limiting
- ✅ Security test coverage

The codebase is now significantly more secure and ready for production use with proper configuration.

---

**Author:** Bogdan Marcen & ChatGPT 5.1  
**Last Updated:** 2025-12-11

