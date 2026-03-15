import express from "express";
import { createStore } from "./lib/store.js";
import { authRequired } from "./lib/auth.js";
import { createLicenseRouter } from "./routes/license.routes.js";
import { createChatRouter } from "./routes/chat.routes.js";
import { createAIRouter } from "./routes/ai.routes.js";
import { createAutomationRouter } from "./routes/automation.routes.js";
import { createKnowledgeRouter } from "./routes/knowledge.routes.js";
import { createDataRouter } from "./routes/data.routes.js";
import { createApiCompatRouter } from "./routes/api-compat.routes.js";

export function createApp(config) {
  const app = express();
  const store = createStore(config.dataFile);
  const auth = authRequired(store, config.jwtSecret);

  app.use(express.json({ limit: "2mb" }));

  app.get("/health", (_req, res) => {
    res.json({ ok: true, service: "pixel-backend-mvp" });
  });

  app.use("/api", createApiCompatRouter(store));
  app.use("/license", createLicenseRouter(store, config));
  app.use("/chat", auth, createChatRouter(store));
  app.use("/ai", auth, createAIRouter(store));
  app.use("/automation", auth, createAutomationRouter(store));
  app.use("/knowledge", auth, createKnowledgeRouter(store));
  app.use("/data", auth, createDataRouter(store));

  app.use((err, _req, res, _next) => {
    console.error(err);
    res.status(500).json({ error: "internal_error" });
  });

  return app;
}
