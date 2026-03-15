import { Router } from "express";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import { parseOr400 } from "../lib/validate.js";

export function createChatRouter(store) {
  const router = Router();

  const createConversationSchema = z.object({
    type: z.enum(["single", "group"]).default("single"),
    title: z.string().min(1),
    memberIds: z.array(z.string()).default([])
  });

  const sendMessageSchema = z.object({
    conversationId: z.string(),
    type: z.enum(["text", "image", "voice"]).default("text"),
    content: z.any()
  });

  router.post("/conversations", (req, res) => {
    const input = parseOr400(createConversationSchema, req.body, res);
    if (!input) return;
    const db = store.read();
    const now = new Date().toISOString();
    const id = uuidv4();
    const allMembers = Array.from(new Set([req.auth.sub, ...input.memberIds]));

    db.conversations.push({
      id,
      type: input.type,
      title: input.title,
      ownerId: req.auth.sub,
      createdAt: now
    });
    for (const uid of allMembers) {
      db.conversationMembers.push({
        id: uuidv4(),
        conversationId: id,
        userId: uid,
        role: uid === req.auth.sub ? "owner" : "member",
        mute: false
      });
    }
    store.write(db);
    res.json({ id });
  });

  router.post("/messages", (req, res) => {
    const input = parseOr400(sendMessageSchema, req.body, res);
    if (!input) return;
    const db = store.read();
    const member = db.conversationMembers.find(
      (m) => m.conversationId === input.conversationId && m.userId === req.auth.sub
    );
    if (!member) {
      return res.status(403).json({ error: "not_in_conversation" });
    }
    const blocked = db.blacklists.find(
      (b) => b.ownerId === member.userId && b.targetId === req.auth.sub
    );
    if (blocked) {
      return res.status(403).json({ error: "blacklisted" });
    }
    const seq =
      db.messages
        .filter((m) => m.conversationId === input.conversationId)
        .reduce((max, m) => Math.max(max, m.seq), 0) + 1;

    const now = new Date();
    const message = {
      id: uuidv4(),
      conversationId: input.conversationId,
      senderId: req.auth.sub,
      type: input.type,
      content: input.content,
      seq,
      sentAt: now.toISOString(),
      sentAtSec: Math.floor(now.getTime() / 1000)
    };
    db.messages.push(message);
    db.messageStates.push({
      id: uuidv4(),
      messageId: message.id,
      userId: req.auth.sub,
      deliveredAt: message.sentAt,
      readAt: null,
      recalledAt: null
    });
    store.write(db);
    res.json(message);
  });

  router.post("/messages/:id/recall", (req, res) => {
    const db = store.read();
    const msg = db.messages.find((m) => m.id === req.params.id);
    if (!msg) return res.status(404).json({ error: "message_not_found" });
    if (msg.senderId !== req.auth.sub) {
      return res.status(403).json({ error: "only_sender_can_recall" });
    }
    const state = db.messageStates.find((s) => s.messageId === msg.id && s.userId === req.auth.sub);
    if (state) {
      state.recalledAt = new Date().toISOString();
    }
    msg.type = "recalled";
    msg.content = { text: "撤回了一条消息" };
    store.write(db);
    res.json({ ok: true });
  });

  router.post("/messages/:id/read", (req, res) => {
    const db = store.read();
    const msg = db.messages.find((m) => m.id === req.params.id);
    if (!msg) return res.status(404).json({ error: "message_not_found" });
    let state = db.messageStates.find((s) => s.messageId === msg.id && s.userId === req.auth.sub);
    if (!state) {
      state = {
        id: uuidv4(),
        messageId: msg.id,
        userId: req.auth.sub,
        deliveredAt: new Date().toISOString(),
        readAt: null,
        recalledAt: null
      };
      db.messageStates.push(state);
    }
    state.readAt = new Date().toISOString();
    store.write(db);
    res.json({ ok: true, readAt: state.readAt });
  });

  router.post("/blacklist/:targetId", (req, res) => {
    const db = store.read();
    db.blacklists.push({
      id: uuidv4(),
      ownerId: req.auth.sub,
      targetId: req.params.targetId,
      reason: req.body?.reason || "",
      createdAt: new Date().toISOString()
    });
    store.write(db);
    res.json({ ok: true });
  });

  router.post("/offline-mode", (req, res) => {
    const schema = z.object({
      enabled: z.boolean(),
      autoReply: z.string().default("")
    });
    const input = parseOr400(schema, req.body, res);
    if (!input) return;
    const db = store.read();
    const current = db.offlineModes.find((m) => m.userId === req.auth.sub);
    if (current) {
      current.enabled = input.enabled;
      current.autoReply = input.autoReply;
      current.updatedAt = new Date().toISOString();
    } else {
      db.offlineModes.push({
        id: uuidv4(),
        userId: req.auth.sub,
        ...input,
        updatedAt: new Date().toISOString()
      });
    }
    store.write(db);
    res.json({ ok: true });
  });

  return router;
}
