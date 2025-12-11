import { WebSocketServer, WebSocket } from "ws";
import { IncomingMessage } from "http";
import { EventBus } from "../core/eventBus";

interface AuthenticatedWebSocket extends WebSocket {
  user?: {
    id: string;
    permissions?: string[];
  };
}

export function createWsServer(server: any, eventBus: EventBus) {
  const wss = new WebSocketServer({ server });
  const requiredToken = process.env.WS_TOKEN;
  const requireAuth = !!requiredToken;

  wss.on("connection", (ws: AuthenticatedWebSocket, req: IncomingMessage) => {
    // Extract token from query string or headers
    const url = new URL(req.url || "", `http://${req.headers.host}`);
    const token = url.searchParams.get("token") || req.headers["sec-websocket-protocol"];

    // Authenticate if required
    if (requireAuth) {
      if (!token || token !== requiredToken) {
        ws.close(4001, "Unauthorized: Invalid or missing token");
        eventBus.emit("SecurityEvent", {
          type: "websocket_auth_failed",
          ip: req.socket.remoteAddress,
          timestamp: Date.now(),
        });
        return;
      }
    }

    // Attach user info (in production, decode JWT here)
    ws.user = {
      id: token || "anonymous",
      permissions: [], // In production, extract from JWT
    };

    ws.send(JSON.stringify({ type: "connected", ts: Date.now() }));

    // Subscribe to events
    const listener = (evt: any) => {
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

