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
      tools: toolsRoutes(toolEngine),
    }
  };

  const app = createHttpServer(deps);

  const server = http.createServer(app);

  // WebSocket
  createWsServer(server, eventBus);

  const PORT = process.env.PORT ? parseInt(process.env.PORT) : 4000;
  
  // Set error handler BEFORE listen
  server.on("error", (error: any) => {
    if (error.code === "EADDRINUSE") {
      console.error("");
      console.error("❌".repeat(25));
      console.error(`❌ ERROR: Port ${PORT} is already in use!`);
      console.error("❌".repeat(25));
      console.error("");
      console.error("Рішення:");
      console.error(`   1. Зупиніть процес на порту ${PORT}:`);
      console.error(`      netstat -ano | findstr :${PORT}`);
      console.error(`      taskkill /PID <PID> /F`);
      console.error("");
      console.error(`   2. Або змініть PORT в .env файлі на інший (наприклад, 4000)`);
      console.error(`      PORT=4000`);
      console.error("");
      console.error(`   3. Або запустіть: fix-port.bat`);
      console.error("");
      process.exit(1);
    } else {
      console.error("❌ Server error:", error);
      process.exit(1);
    }
  });
  
  server.listen(PORT, () => {
    console.log("");
    console.log("=".repeat(50));
    console.log("🚀 Arium server is running!");
    console.log("=".repeat(50));
    console.log(`📡 HTTP API:  http://localhost:${PORT}`);
    console.log(`🔌 WebSocket: ws://localhost:${PORT}`);
    console.log("");
    console.log("Available endpoints:");
    console.log(`  GET  http://localhost:${PORT}/              - API info`);
    console.log(`  GET  http://localhost:${PORT}/health         - Health check`);
    console.log(`  POST http://localhost:${PORT}/agent/run     - Run agent task`);
    console.log(`  GET  http://localhost:${PORT}/vfs/list      - List files`);
    console.log(`  GET  http://localhost:${PORT}/tools/list    - List tools`);
    console.log(`  GET  http://localhost:${PORT}/events        - Get events`);
    console.log("");
    console.log("💡 Open http://localhost:" + PORT + " in your browser to test");
    console.log("=".repeat(50));
    console.log("");
  });

  return server;
}
