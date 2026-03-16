import { Router } from "express";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import { parseOr400 } from "../lib/validate.js";

const roleInputSchema = z.object({
  name: z.string().min(1),
  avatar: z.string().default(""),
  description: z.string().default(""),
  worldBookId: z.string().optional(),
  persona: z
    .object({
      identity: z.string().default(""),
      relationship: z.string().default(""),
      speakingStyle: z.string().default(""),
      values: z.string().default(""),
      boundaries: z.string().default(""),
      worldview: z.string().default(""),
      sampleDialogues: z.array(z.object({ user: z.string(), assistant: z.string() })).default([])
    })
    .default({
      identity: "",
      relationship: "",
      speakingStyle: "",
      values: "",
      boundaries: "",
      worldview: "",
      sampleDialogues: []
    })
});

const configInputSchema = z.object({
  baseUrl: z.string().default(""),
  model: z.string().default(""),
  apiKey: z.string().default(""),
  headers: z.record(z.string()).optional()
});

const worldBookSchema = z.object({
  name: z.string().min(1),
  content: z.string().default("")
});

const sessionBindSchema = z.object({
  roleId: z.string().min(1),
  worldBookId: z.string().default("")
});

const chatSchema = z.object({
  roleId: z.string().min(1),
  sessionId: z.string().min(1),
  message: z.string().min(1)
});

export function createApiCompatRouter(store) {
  const router = Router();

  router.get("/roles", (_req, res) => {
    const db = store.read();
    res.json({ roles: db.roles });
  });

  router.post("/roles", (req, res) => {
    const input = parseOr400(roleInputSchema, req.body, res);
    if (!input) return;
    const db = store.read();
    const now = new Date().toISOString();
    const role = {
      id: uuidv4(),
      ...input,
      createdAt: now,
      updatedAt: now
    };
    db.roles.push(role);
    store.write(db);
    res.json({ role });
  });

  router.put("/roles/:roleId", (req, res) => {
    const input = parseOr400(roleInputSchema, req.body, res);
    if (!input) return;
    const db = store.read();
    const role = db.roles.find((r) => r.id === req.params.roleId);
    if (!role) {
      return res.status(404).json({ code: "role_not_found", message: "角色不存在" });
    }
    Object.assign(role, input, { updatedAt: new Date().toISOString() });
    store.write(db);
    res.json({ role });
  });

  router.put("/roles/:roleId/worldbook", (req, res) => {
    const schema = z.object({ worldBookId: z.string().default("") });
    const input = parseOr400(schema, req.body, res);
    if (!input) return;
    const db = store.read();
    const role = db.roles.find((r) => r.id === req.params.roleId);
    if (!role) {
      return res.status(404).json({ code: "role_not_found", message: "角色不存在" });
    }
    role.worldBookId = input.worldBookId;
    role.updatedAt = new Date().toISOString();
    store.write(db);
    res.json({ ok: true, role });
  });

  router.get("/config", (_req, res) => {
    const db = store.read();
    const cfg = db.aiConfig || { baseUrl: "", model: "", apiKey: "", headers: {} };
    res.json({
      baseUrl: cfg.baseUrl || "",
      model: cfg.model || "",
      headers: cfg.headers || {},
      hasApiKey: Boolean(cfg.apiKey),
      maskedApiKey: maskKey(cfg.apiKey || "")
    });
  });

  router.put("/config", (req, res) => {
    const input = parseOr400(configInputSchema, req.body, res);
    if (!input) return;
    const db = store.read();
    const current = db.aiConfig || { baseUrl: "", model: "", apiKey: "", headers: {} };
    db.aiConfig = {
      baseUrl: input.baseUrl,
      model: input.model,
      headers: input.headers || {},
      apiKey: input.apiKey?.trim() ? input.apiKey.trim() : current.apiKey || ""
    };
    store.write(db);
    res.json({
      ok: true,
      hasApiKey: Boolean(db.aiConfig.apiKey),
      maskedApiKey: maskKey(db.aiConfig.apiKey)
    });
  });

  router.get("/chat-settings", (_req, res) => {
    const db = store.read();
    res.json(db.chatUiSettings);
  });

  router.put("/chat-settings", (req, res) => {
    const schema = z.object({
      showTimestamp: z.boolean(),
      showSeconds: z.boolean(),
      timestampStyle: z.enum(["bubble", "avatar", "hidden"]),
      showReadReceipt: z.boolean(),
      readReceiptStyle: z.enum(["bubble", "avatar", "hidden"]),
      hideAvatarMode: z.enum(["none", "both", "friend", "me"]),
      myBubbleColor: z.string(),
      friendBubbleColor: z.string(),
      buttonBipEnabled: z.boolean()
    });
    const input = parseOr400(schema, req.body, res);
    if (!input) return;
    const db = store.read();
    db.chatUiSettings = input;
    store.write(db);
    res.json({ ok: true, chatUiSettings: db.chatUiSettings });
  });

  router.get("/user-persona", (_req, res) => {
    const db = store.read();
    res.json(db.userPersona);
  });

  router.put("/user-persona", (req, res) => {
    const schema = z.object({
      readableMemory: z.string(),
      privateMemory: z.string(),
      allowPrivateForAI: z.boolean()
    });
    const input = parseOr400(schema, req.body, res);
    if (!input) return;
    const db = store.read();
    db.userPersona = input;
    store.write(db);
    res.json({ ok: true, userPersona: db.userPersona });
  });

  router.post("/chat", (req, res) => {
    const input = parseOr400(chatSchema, req.body, res);
    if (!input) return;
    const db = store.read();
    const role = db.roles.find((r) => r.id === input.roleId);
    if (!role) {
      return res.status(404).json({ code: "role_not_found", message: "角色不存在" });
    }

    const now = new Date();
    let session = db.roleSessions.find((s) => s.sessionId === input.sessionId);
    if (!session) {
      session = {
        id: uuidv4(),
        sessionId: input.sessionId,
        roleId: input.roleId,
        sessionWorldBookId: "",
        memory: { summary: "", facts: [] },
        conversation: []
      };
      db.roleSessions.push(session);
    }

    session.conversation.push({
      role: "user",
      content: input.message,
      timestamp: now.toISOString()
    });
    const reply = `【${role.name}】收到：${input.message}`;
    session.conversation.push({
      role: "assistant",
      content: reply,
      timestamp: new Date(now.getTime() + 300).toISOString()
    });

    const recentUserMessages = session.conversation
      .filter((m) => m.role === "user")
      .slice(-3)
      .map((m) => m.content);
    session.memory = {
      summary: recentUserMessages.length ? `最近你在聊：${recentUserMessages.join(" / ")}` : "",
      facts: [
        role.worldBookId ? `角色绑定世界书：${role.worldBookId}` : "角色未绑定世界书",
        session.sessionWorldBookId ? `会话绑定世界书：${session.sessionWorldBookId}` : "会话未绑定世界书"
      ]
    };
    store.write(db);
    res.json({
      reply,
      role,
      sessionId: input.sessionId,
      sessionWorldBookId: session.sessionWorldBookId,
      memory: session.memory,
      conversation: session.conversation
    });
  });

  router.get("/worldbooks", (_req, res) => {
    const db = store.read();
    res.json({ worldBooks: db.worldBooks });
  });

  router.post("/worldbooks", (req, res) => {
    const input = parseOr400(worldBookSchema, req.body, res);
    if (!input) return;
    const db = store.read();
    const now = new Date().toISOString();
    const worldBook = {
      id: uuidv4(),
      ...input,
      createdAt: now,
      updatedAt: now
    };
    db.worldBooks.push(worldBook);
    store.write(db);
    res.json({ worldBook });
  });

  router.put("/sessions/:sessionId/worldbook", (req, res) => {
    const input = parseOr400(sessionBindSchema, req.body, res);
    if (!input) return;
    const db = store.read();
    let session = db.roleSessions.find((s) => s.sessionId === req.params.sessionId);
    if (!session) {
      session = {
        id: uuidv4(),
        sessionId: req.params.sessionId,
        roleId: input.roleId,
        sessionWorldBookId: input.worldBookId,
        memory: { summary: "", facts: [] },
        conversation: []
      };
      db.roleSessions.push(session);
    } else {
      session.roleId = input.roleId;
      session.sessionWorldBookId = input.worldBookId;
    }
    store.write(db);
    res.json({ ok: true, sessionId: req.params.sessionId, worldBookId: input.worldBookId });
  });

  router.get("/export", (_req, res) => {
    const db = store.read();
    res.json({
      exportedAt: new Date().toISOString(),
      roles: db.roles,
      worldBooks: db.worldBooks,
      sessions: db.roleSessions,
      config: {
        baseUrl: db.aiConfig.baseUrl || "",
        model: db.aiConfig.model || "",
        hasApiKey: Boolean(db.aiConfig.apiKey),
        maskedApiKey: maskKey(db.aiConfig.apiKey || "")
      },
      chatSettings: db.chatUiSettings,
      userPersona: db.userPersona
    });
  });

  return router;
}

function maskKey(value) {
  if (!value) return "";
  if (value.length <= 6) return "***";
  return `${value.slice(0, 3)}***${value.slice(-3)}`;
}
