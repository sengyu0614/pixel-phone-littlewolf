import { Router } from "express";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import { parseOr400 } from "../lib/validate.js";

export function createAIRouter(store) {
  const router = Router();

  const providerSchema = z.object({
    name: z.string().min(1),
    baseUrl: z.string().url(),
    apiKey: z.string().min(1)
  });
  const modelSchema = z.object({
    providerId: z.string(),
    modelName: z.string().min(1),
    contextLimit: z.number().int().positive().default(16000)
  });
  const presetSchema = z.object({
    name: z.string().min(1),
    providerId: z.string(),
    modelId: z.string(),
    temperature: z.number().min(0).max(2).default(0.8),
    memoryCount: z.number().int().min(1).max(100).default(20),
    systemPrompt: z.string().default("你是一个有帮助的助手")
  });
  const bindSchema = z.object({
    conversationId: z.string(),
    presetId: z.string(),
    override: z.record(z.any()).default({})
  });

  router.get("/providers", (_req, res) => {
    const db = store.read();
    const safe = db.aiProviders.map((p) => ({ ...p, apiKeyMasked: maskKey(p.apiKey), apiKey: undefined }));
    res.json(safe);
  });

  router.post("/providers", (req, res) => {
    const input = parseOr400(providerSchema, req.body, res);
    if (!input) return;
    const db = store.read();
    db.aiProviders.push({
      id: uuidv4(),
      ownerId: req.auth.sub,
      name: input.name,
      baseUrl: input.baseUrl,
      apiKey: input.apiKey,
      enabled: true,
      createdAt: new Date().toISOString()
    });
    store.write(db);
    res.json({ ok: true });
  });

  router.get("/models", (req, res) => {
    const providerId = req.query.providerId;
    const db = store.read();
    const rows = providerId ? db.aiModels.filter((m) => m.providerId === providerId) : db.aiModels;
    res.json(rows);
  });

  router.post("/models", (req, res) => {
    const input = parseOr400(modelSchema, req.body, res);
    if (!input) return;
    const db = store.read();
    db.aiModels.push({
      id: uuidv4(),
      ...input,
      enabled: true,
      createdAt: new Date().toISOString()
    });
    store.write(db);
    res.json({ ok: true });
  });

  router.get("/presets", (req, res) => {
    const db = store.read();
    res.json(db.aiPresets.filter((p) => p.ownerId === req.auth.sub));
  });

  router.post("/presets", (req, res) => {
    const input = parseOr400(presetSchema, req.body, res);
    if (!input) return;
    const db = store.read();
    db.aiPresets.push({
      id: uuidv4(),
      ownerId: req.auth.sub,
      ...input,
      createdAt: new Date().toISOString()
    });
    store.write(db);
    res.json({ ok: true });
  });

  router.post("/bind", (req, res) => {
    const input = parseOr400(bindSchema, req.body, res);
    if (!input) return;
    const db = store.read();
    const existed = db.conversationAIBinds.find((x) => x.conversationId === input.conversationId);
    if (existed) {
      existed.presetId = input.presetId;
      existed.override = input.override;
      existed.updatedAt = new Date().toISOString();
    } else {
      db.conversationAIBinds.push({
        id: uuidv4(),
        ...input,
        updatedAt: new Date().toISOString()
      });
    }
    store.write(db);
    res.json({ ok: true });
  });

  return router;
}

function maskKey(v) {
  if (!v || v.length < 8) return "***";
  return `${v.slice(0, 3)}***${v.slice(-3)}`;
}
