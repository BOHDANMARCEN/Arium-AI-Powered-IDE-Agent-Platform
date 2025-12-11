import { WebSocketServer } from "ws";

export function createWsServer(server: any, eventBus: any) {
  const wss = new WebSocketServer({ server });

  wss.on("connection", ws => {
    ws.send(JSON.stringify({ type: "connected", ts: Date.now() }));

    eventBus.on("any", evt => {
      ws.send(JSON.stringify({ type: "event", event: evt }));
    });
  });

  return wss;
}

