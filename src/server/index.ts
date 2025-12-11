import http from "http";
import { createHttpServer } from "./http";
import { createWsServer } from "./websocket";

import { agentRoutes } from "./routes/agent";
import { vfsRoutes } from "./routes/vfs";
import { eventRoutes } from "./routes/events";
import { toolsRoutes } from "./routes/tools";

export async function startServer({ agent, vfs, eventBus, toolEngine }: {
  agent: any;
  vfs: any;
  eventBus: any;
  toolEngine: any;
}) {
  const deps = {
    routes: {
      agent: agentRoutes(agent),
      vfs: vfsRoutes(vfs),
      events: eventRoutes(eventBus),
      tools: toolsRoutes(toolEngine)
    }
  };

  const app = createHttpServer(deps);

  const server = http.createServer(app);

  // WebSocket
  createWsServer(server, eventBus);

  const PORT = process.env.PORT ? parseInt(process.env.PORT) : 4000;
  server.listen(PORT, () => {
    console.log(`🚀 Arium server running at http://localhost:${PORT}`);
    console.log(`📡 WebSocket available at ws://localhost:${PORT}`);
  });

  return server;
}

