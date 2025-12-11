import express from "express";
import cors from "cors";
import bodyParser from "body-parser";

export function createHttpServer(deps: any) {
  const app = express();
  app.use(cors());
  app.use(bodyParser.json());

  // register route modules
  app.use("/agent", deps.routes.agent);
  app.use("/vfs", deps.routes.vfs);
  app.use("/events", deps.routes.events);
  app.use("/tools", deps.routes.tools);

  return app;
}

