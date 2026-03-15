import { Router } from "express";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import { parseOr400 } from "../lib/validate.js";

const exportScopes = {
  chat: ["conversations", "conversationMembers", "messages", "messageStates", "blacklists", "offlineModes"],
  profile: ["users", "worldbooks", "personas", "relationships", "contextBindings"],
  all: null
};

export function createDataRouter(store) {
  const router = Router();

  router.post("/import", (req, res) => {
    const schema = z.object({
      payload: z.record(z.any())
    });
    const input = parseOr400(schema, req.body, res);
    if (!input) return;

    const db = store.read();
    const now = new Date().toISOString();
    const job = {
      id: uuidv4(),
      userId: req.auth.sub,
      type: "import",
      scope: "partial",
      status: "success",
      createdAt: now
    };

    for (const [k, v] of Object.entries(input.payload)) {
      if (Array.isArray(db[k]) && Array.isArray(v)) {
        db[k] = [...db[k], ...v];
      }
    }
    db.audits.push({
      id: uuidv4(),
      actorId: req.auth.sub,
      action: "data_import",
      target: "self",
      createdAt: now
    });
    db.dataJobs = db.dataJobs || [];
    db.dataJobs.push(job);
    store.write(db);
    res.json({ ok: true, job });
  });

  router.post("/export", (req, res) => {
    const schema = z.object({
      scope: z.enum(["chat", "profile", "all"]).default("all")
    });
    const input = parseOr400(schema, req.body, res);
    if (!input) return;
    const db = store.read();
    const fields = exportScopes[input.scope];
    const payload = {};
    const source = fields || Object.keys(db);
    for (const key of source) {
      payload[key] = db[key];
    }
    const job = {
      id: uuidv4(),
      userId: req.auth.sub,
      type: "export",
      scope: input.scope,
      status: "success",
      createdAt: new Date().toISOString()
    };
    db.dataJobs = db.dataJobs || [];
    db.dataJobs.push(job);
    store.write(db);
    res.json({ job, payload });
  });

  router.delete("/purge", (req, res) => {
    const schema = z.object({
      confirmText: z.literal("PURGE_ALL")
    });
    const input = parseOr400(schema, req.body, res);
    if (!input) return;
    const db = store.read();
    db.conversations = db.conversations.filter((x) => x.ownerId !== req.auth.sub);
    db.conversationMembers = db.conversationMembers.filter((x) => x.userId !== req.auth.sub);
    db.messages = db.messages.filter((x) => x.senderId !== req.auth.sub);
    db.messageStates = db.messageStates.filter((x) => x.userId !== req.auth.sub);
    db.blacklists = db.blacklists.filter((x) => x.ownerId !== req.auth.sub);
    db.offlineModes = db.offlineModes.filter((x) => x.userId !== req.auth.sub);
    db.aiProviders = db.aiProviders.filter((x) => x.ownerId !== req.auth.sub);
    db.aiPresets = db.aiPresets.filter((x) => x.ownerId !== req.auth.sub);
    db.automationRules = db.automationRules.filter((x) => x.ownerId !== req.auth.sub);
    db.automationJobs = db.automationJobs.filter((x) => x.ownerId !== req.auth.sub);
    db.worldbooks = db.worldbooks.filter((x) => x.ownerId !== req.auth.sub);
    db.personas = db.personas.filter((x) => x.ownerId !== req.auth.sub);
    db.relationships = db.relationships.filter((x) => x.ownerId !== req.auth.sub);
    db.contextBindings = db.contextBindings.filter((x) => x.ownerId !== req.auth.sub);
    db.audits.push({
      id: uuidv4(),
      actorId: req.auth.sub,
      action: "data_purge_all",
      target: "self",
      createdAt: new Date().toISOString()
    });
    store.write(db);
    res.json({ ok: true });
  });

  return router;
}
