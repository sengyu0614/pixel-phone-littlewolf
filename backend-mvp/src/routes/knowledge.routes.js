import { Router } from "express";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import { parseOr400 } from "../lib/validate.js";

export function createKnowledgeRouter(store) {
  const router = Router();

  const worldbookSchema = z.object({
    name: z.string().min(1),
    content: z.record(z.any())
  });
  const personaSchema = z.object({
    name: z.string().min(1),
    profile: z.record(z.any()),
    speakingStyle: z.record(z.any()).default({})
  });
  const relationSchema = z.object({
    srcRoleId: z.string(),
    dstRoleId: z.string(),
    affinity: z.number().min(-100).max(100).default(0),
    tags: z.array(z.string()).default([])
  });
  const bindingSchema = z.object({
    scopeType: z.enum(["chat", "forum", "moments"]),
    scopeId: z.string(),
    worldbookId: z.string().optional(),
    personaId: z.string().optional()
  });

  router.post("/worldbooks", (req, res) => {
    const input = parseOr400(worldbookSchema, req.body, res);
    if (!input) return;
    const db = store.read();
    db.worldbooks.push({
      id: uuidv4(),
      ownerId: req.auth.sub,
      name: input.name,
      version: 1,
      content: input.content,
      createdAt: new Date().toISOString()
    });
    store.write(db);
    res.json({ ok: true });
  });

  router.post("/personas", (req, res) => {
    const input = parseOr400(personaSchema, req.body, res);
    if (!input) return;
    const db = store.read();
    db.personas.push({
      id: uuidv4(),
      ownerId: req.auth.sub,
      ...input,
      createdAt: new Date().toISOString()
    });
    store.write(db);
    res.json({ ok: true });
  });

  router.post("/relationships", (req, res) => {
    const input = parseOr400(relationSchema, req.body, res);
    if (!input) return;
    const db = store.read();
    db.relationships.push({
      id: uuidv4(),
      ownerId: req.auth.sub,
      ...input,
      createdAt: new Date().toISOString()
    });
    store.write(db);
    res.json({ ok: true });
  });

  router.post("/bind", (req, res) => {
    const input = parseOr400(bindingSchema, req.body, res);
    if (!input) return;
    const db = store.read();
    const row = db.contextBindings.find(
      (b) =>
        b.ownerId === req.auth.sub &&
        b.scopeType === input.scopeType &&
        b.scopeId === input.scopeId
    );
    if (row) {
      row.worldbookId = input.worldbookId || null;
      row.personaId = input.personaId || null;
      row.updatedAt = new Date().toISOString();
    } else {
      db.contextBindings.push({
        id: uuidv4(),
        ownerId: req.auth.sub,
        ...input,
        createdAt: new Date().toISOString()
      });
    }
    store.write(db);
    res.json({ ok: true });
  });

  router.get("/snapshot", (req, res) => {
    const db = store.read();
    res.json({
      worldbooks: db.worldbooks.filter((x) => x.ownerId === req.auth.sub),
      personas: db.personas.filter((x) => x.ownerId === req.auth.sub),
      relationships: db.relationships.filter((x) => x.ownerId === req.auth.sub),
      bindings: db.contextBindings.filter((x) => x.ownerId === req.auth.sub)
    });
  });

  return router;
}
