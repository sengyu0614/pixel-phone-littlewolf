import { Router } from "express";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import jwt from "jsonwebtoken";
import { issueToken } from "../lib/auth.js";
import { parseOr400 } from "../lib/validate.js";

export function createLicenseRouter(store, config) {
  const router = Router();

  const activateSchema = z.object({
    code: z.string().min(3),
    deviceId: z.string().min(3),
    nickname: z.string().min(1).default("新用户")
  });
  const refreshSchema = z.object({
    deviceId: z.string().min(3)
  });

  router.post("/activate", (req, res) => {
    const input = parseOr400(activateSchema, req.body, res);
    if (!input) return;

    const now = new Date().toISOString();
    const db = store.read();
    const normalizedInputCode = input.code.trim().toUpperCase();
    const codeRow = db.activationCodes.find(
      (c) => (c.code || "").trim().toUpperCase() === normalizedInputCode
    );
    if (!codeRow) {
      return res.status(400).json({ error: "invalid_code" });
    }
    if (codeRow.status !== "active") {
      return res.status(400).json({ error: "code_not_active" });
    }
    if (codeRow.expireAt && new Date(codeRow.expireAt).getTime() < Date.now()) {
      return res.status(400).json({ error: "code_expired" });
    }
    if (codeRow.usedCount >= codeRow.maxUses) {
      return res.status(400).json({ error: "code_exhausted" });
    }

    let user = db.users.find((u) => u.deviceId === input.deviceId);
    if (!user) {
      user = {
        id: uuidv4(),
        deviceId: input.deviceId,
        nickname: input.nickname,
        avatar: "",
        status: "active",
        createdAt: now
      };
      db.users.push(user);
    }

    const license = {
      id: uuidv4(),
      codeId: codeRow.id,
      userId: user.id,
      deviceId: input.deviceId,
      activatedAt: now,
      lastSeenAt: now,
      revokeStatus: "normal"
    };
    db.licenses.push(license);
    codeRow.usedCount += 1;

    const token = issueToken(user.id, input.deviceId, config.jwtSecret);
    const payload = jwt.decode(token);
    db.sessions.push({
      id: uuidv4(),
      userId: user.id,
      sid: payload.sid,
      deviceId: input.deviceId,
      createdAt: now,
      revoked: false
    });

    db.audits.push({
      id: uuidv4(),
      actorId: user.id,
      action: "license_activate",
      target: input.deviceId,
      createdAt: now
    });
    store.write(db);

    return res.json({
      token,
      user,
      license
    });
  });

  router.post("/refresh", (req, res) => {
    const input = parseOr400(refreshSchema, req.body, res);
    if (!input) return;
    const db = store.read();
    const license = db.licenses.find(
      (l) => l.deviceId === input.deviceId && l.revokeStatus === "normal"
    );
    if (!license) {
      return res.status(404).json({ error: "license_not_found" });
    }
    const user = db.users.find((u) => u.id === license.userId);
    if (!user) {
      return res.status(404).json({ error: "user_not_found" });
    }
    const token = issueToken(user.id, input.deviceId, config.jwtSecret);
    const payload = jwt.decode(token);
    db.sessions.push({
      id: uuidv4(),
      userId: user.id,
      sid: payload.sid,
      deviceId: input.deviceId,
      createdAt: new Date().toISOString(),
      revoked: false
    });
    license.lastSeenAt = new Date().toISOString();
    store.write(db);
    return res.json({ token, user, license });
  });

  return router;
}
