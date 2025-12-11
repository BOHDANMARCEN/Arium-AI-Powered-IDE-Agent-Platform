import { WebSocketServer, WebSocket } from "ws";
import { IncomingMessage } from "http";
import { Server } from "http";
import { EventBus } from "../core/eventBus";
import { extractToken, verifyToken, getJWTSecret } from "./auth";
import { wsRateLimiter } from "./middleware/wsRateLimit";

interface AuthenticatedWebSocket extends WebSocket {
  auth?: {
    id: string;
    permissions?: string[];
    roles?: string[];
  };
  user?: {
    id: string;
    permissions?: string[];
  };
}

const REQUIRE_AUTH = process.env.WS_REQUIRE_AUTH !== "false"; // Default: require auth

export function createWsServer(server: Server, eventBus: EventBus) {
  const wss = new WebSocketServer({ noServer: true });

  // Handle upgrade requests with authentication
  server.on("upgrade", (request: IncomingMessage, socket: NodeJS.ReadableStream & NodeJS.WritableStream, head: Buffer) => {
    const clientIp = request.socket.remoteAddress || "unknown";
    
    // Rate limiting on handshake
    const rateLimitResult = wsRateLimiter.check(clientIp);
    if (!rateLimitResult.allowed) {
      socket.write("HTTP/1.1 429 Too Many Requests\r\n\r\n");
      socket.destroy();
      
      // Audit log: rate limit exceeded
      eventBus.emit("SecurityEvent", {
        type: "websocket_rate_limit_exceeded",
        ip: clientIp,
        blockedUntil: rateLimitResult.blockedUntil,
        timestamp: Date.now(),
      });
      return;
    }

    // Extract token from query or headers
    const token = extractToken({
      headers: request.headers,
      url: request.url,
    });

    if (REQUIRE_AUTH) {
      if (!token) {
        wsRateLimiter.recordFailure(clientIp);
        socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
        socket.destroy();
        
        // Audit log: missing token
        eventBus.emit("SecurityEvent", {
          type: "websocket_auth_failed",
          reason: "missing_token",
          ip: clientIp,
          timestamp: Date.now(),
        });
        return;
      }

      try {
        // Verify JWT token
        const secret = getJWTSecret();
        const payload = verifyToken(token, secret);
        
        // Audit log: successful authentication
        eventBus.emit("SecurityEvent", {
          type: "websocket_auth_success",
          userId: payload.id,
          ip: clientIp,
          timestamp: Date.now(),
        });
        
        // Upgrade connection with authenticated payload
        wss.handleUpgrade(request, socket, head, (ws: AuthenticatedWebSocket) => {
          // Attach auth info to socket
          ws.auth = {
            id: payload.id,
            permissions: payload.permissions || [],
            roles: payload.roles || [],
          };
          // Also set user for backward compatibility
          ws.user = {
            id: payload.id,
            permissions: payload.permissions || [],
          };
          wss.emit("connection", ws, request);
        });
      } catch (err: unknown) {
        wsRateLimiter.recordFailure(clientIp);
        const errMsg = err instanceof Error ? err.message : String(err);
        socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
        socket.destroy();
        
        // Audit log: authentication failure
        eventBus.emit("SecurityEvent", {
          type: "websocket_auth_failed",
          reason: errMsg || "invalid_token",
          ip: clientIp,
          timestamp: Date.now(),
        });
        return;
      }
    } else {
      // No auth required - upgrade directly
      wss.handleUpgrade(request, socket, head, (ws: AuthenticatedWebSocket) => {
        ws.auth = { id: "anonymous", permissions: [] };
        ws.user = { id: "anonymous", permissions: [] };
        wss.emit("connection", ws, request);
      });
    }
  });

  wss.on("connection", (ws: AuthenticatedWebSocket, req: IncomingMessage) => {
    // Connection is already authenticated at this point
    const authInfo = ws.auth || { id: "anonymous", permissions: [] };

    ws.send(
      JSON.stringify({
        type: "connected",
        ts: Date.now(),
        userId: authInfo.id,
      })
    );

    // Subscribe to events
    const listener = (evt: EventEnvelope) => {
      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(JSON.stringify({ type: "event", event: evt }));
        } catch (error) {
          // Connection closed, remove listener
          eventBus.off("any", listener);
        }
      }
    };

    eventBus.on("any", listener);

    // Clean up on disconnect
    ws.on("close", () => {
      eventBus.off("any", listener);
    });

    ws.on("error", (error) => {
      console.error("[WebSocket] Error:", error);
      eventBus.off("any", listener);
    });
  });

  return wss;
}

