/**
 * Arium CLI - Agent Debug Command
 * Connects to WebSocket debug stream for real-time agent monitoring
 *
 * Author: Bogdan Marcen & ChatGPT 5.1
 */

import { Command } from "commander";
import WebSocket from "ws";
import { loadConfig } from "../utils/loadConfig";

export function registerAgentDebugCommand(program: Command) {
  program
    .command("agent:debug")
    .description("Connect to agent debug WebSocket stream")
    .option("--id <agent-id>", "Agent ID to debug", "default-agent")
    .option("--host <host>", "Server host", "localhost")
    .option("--port <port>", "Server port", "4000")
    .option("--config <config>", "Path to arium.config.json", "./arium.config.json")
    .action(async (options) => {
      try {
        // Load configuration
        const config = await loadConfig(options.config);

        const host = options.host || config.server?.host || "localhost";
        const port = options.port || config.server?.port || 4000;
        const agentId = options.id;

        const wsUrl = `ws://${host}:${port}/debug/${agentId}`;

        console.log(`🔍 Connecting to agent debug stream...`);
        console.log(`   Agent ID: ${agentId}`);
        console.log(`   WebSocket: ${wsUrl}`);
        console.log(`   Press Ctrl+C to exit`);
        console.log("");

        // Connect to WebSocket
        const ws = new WebSocket(wsUrl);

        ws.on("open", () => {
          console.log(`✅ Connected to debug stream for agent: ${agentId}`);
          console.log("📡 Listening for events...\n");
        });

        ws.on("message", (data: Buffer) => {
          try {
            const message = JSON.parse(data.toString());
            displayEvent(message);
          } catch (error) {
            console.log(`📨 Raw message: ${data.toString()}`);
          }
        });

        ws.on("error", (error) => {
          console.error(`❌ WebSocket error: ${error.message}`);
          process.exit(1);
        });

        ws.on("close", (code, reason) => {
          console.log(`\n🔌 Connection closed (${code}): ${reason.toString() || "No reason provided"}`);
          process.exit(0);
        });

        // Handle graceful shutdown
        process.on("SIGINT", () => {
          console.log("\n🛑 Closing debug connection...");
          ws.close();
          process.exit(0);
        });

        // Keep the process running
        setInterval(() => {
          // Heartbeat to keep connection alive
          if (ws.readyState === WebSocket.OPEN) {
            ws.ping();
          }
        }, 30000);

      } catch (error: any) {
        console.error(`❌ Failed to start debug session: ${error.message}`);
        process.exit(1);
      }
    });
}

function displayEvent(event: any): void {
  const timestamp = new Date(event.timestamp || Date.now()).toLocaleTimeString();
  const eventType = event.type || "unknown";
  const source = event.meta?.source || event.payload?.agentId || "system";

  // Color code by event type
  let icon = "📝";
  let color = "\x1b[37m"; // white

  switch (eventType) {
    case "AgentStartEvent":
      icon = "🚀";
      color = "\x1b[32m"; // green
      break;
    case "AgentStepEvent":
      icon = "📍";
      color = "\x1b[36m"; // cyan
      break;
    case "AgentFinishEvent":
      icon = "✅";
      color = "\x1b[32m"; // green
      break;
    case "ToolExecutionEvent":
      icon = "🔧";
      color = "\x1b[33m"; // yellow
      break;
    case "ModelResponseEvent":
      icon = "🤖";
      color = "\x1b[35m"; // magenta
      break;
    case "VFSChangeEvent":
      icon = "📁";
      color = "\x1b[34m"; // blue
      break;
    case "SecurityEvent":
      icon = "🔒";
      color = "\x1b[31m"; // red
      break;
    case "ModelErrorEvent":
    case "ToolErrorEvent":
      icon = "❌";
      color = "\x1b[31m"; // red
      break;
    case "context_summarized":
      icon = "🧹";
      color = "\x1b[36m"; // cyan
      break;
  }

  console.log(`${color}[${timestamp}] ${icon} ${eventType} (${source})\x1b[0m`);

  // Display payload summary
  if (event.payload) {
    const payloadStr = JSON.stringify(event.payload, null, 2);
    if (payloadStr.length < 200) {
      console.log(`   ${payloadStr.split('\n').join('\n   ')}`);
    } else {
      console.log(`   ${JSON.stringify(event.payload)}`);
    }
  }

  console.log("");
}
