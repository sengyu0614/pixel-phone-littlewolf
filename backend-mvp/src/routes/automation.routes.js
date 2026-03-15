import { Router } from "express";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import { parseOr400 } from "../lib/validate.js";

export function createAutomationRouter(store) {
  const router = Router();

  const ruleSchema = z.object({
    scenario: z.enum(["auto_post", "auto_comment", "auto_interact", "auto_summary"]),
    enabled: z.boolean().default(true),
    intervalMinutes: z.number().int().min(1).max(1440).default(30),
    params: z.record(z.any()).default({})
  });

  router.get("/rules", (req, res) => {
    const db = store.read();
    res.json(db.automationRules.filter((r) => r.ownerId === req.auth.sub));
  });

  router.post("/rules", (req, res) => {
    const input = parseOr400(ruleSchema, req.body, res);
    if (!input) return;
    const db = store.read();
    db.automationRules.push({
      id: uuidv4(),
      ownerId: req.auth.sub,
      ...input,
      createdAt: new Date().toISOString(),
      nextRunAt: calcNextRun(input.intervalMinutes)
    });
    store.write(db);
    res.json({ ok: true });
  });

  router.post("/run-now/:ruleId", (req, res) => {
    const db = store.read();
    const rule = db.automationRules.find((r) => r.id === req.params.ruleId && r.ownerId === req.auth.sub);
    if (!rule) {
      return res.status(404).json({ error: "rule_not_found" });
    }
    const result = mockGenerate(rule.scenario, req.auth.sub);
    const job = {
      id: uuidv4(),
      ruleId: rule.id,
      ownerId: req.auth.sub,
      status: "success",
      payload: result,
      retryCount: 0,
      runAt: new Date().toISOString()
    };
    db.automationJobs.push(job);
    store.write(db);
    res.json(job);
  });

  router.get("/jobs", (req, res) => {
    const db = store.read();
    res.json(db.automationJobs.filter((j) => j.ownerId === req.auth.sub).slice(-50));
  });

  return router;
}

function calcNextRun(intervalMinutes) {
  return new Date(Date.now() + intervalMinutes * 60000).toISOString();
}

function mockGenerate(scenario, userId) {
  const textMap = {
    auto_post: "角色自动发朋友圈：今天也在推进剧情发展。",
    auto_comment: "角色自动评论：这条动态很有共鸣。",
    auto_interact: "角色间自动互动：A 与 B 完成了一次公开互动。",
    auto_summary: "自动总结：最近对话主要围绕关系升温与任务推进。"
  };
  return {
    userId,
    scenario,
    generatedText: textMap[scenario],
    tokenCost: Math.floor(Math.random() * 500) + 100
  };
}
