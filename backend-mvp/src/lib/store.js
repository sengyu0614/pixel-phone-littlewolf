import fs from "node:fs";
import path from "node:path";
import { v4 as uuidv4 } from "uuid";

const initialState = {
  activationCodes: [
    {
      id: uuidv4(),
      code: "PIXEL-2026",
      status: "active",
      maxUses: 999999,
      usedCount: 0,
      expireAt: null,
      channel: "default"
    }
  ],
  licenses: [],
  users: [],
  sessions: [],
  conversations: [],
  conversationMembers: [],
  messages: [],
  roles: [],
  worldBooks: [],
  roleSessions: [],
  aiConfig: {
    baseUrl: "",
    model: "",
    apiKey: "",
    headers: {}
  },
  chatUiSettings: {
    showTimestamp: true,
    showSeconds: false,
    timestampStyle: "bubble",
    showReadReceipt: true,
    readReceiptStyle: "bubble",
    hideAvatarMode: "none",
    myBubbleColor: "#4c1d95",
    friendBubbleColor: "#312e81",
    buttonBipEnabled: true
  },
  userPersona: {
    readableMemory: "",
    privateMemory: "",
    allowPrivateForAI: false
  },
  socialMeta: {
    roleAvatarMap: {},
    friendGroupNames: ["默认分组"],
    friendGroupMap: {},
    relationshipMap: {},
    groupMetaMap: {}
  },
  aiProviders: [],
  aiModels: [],
  aiPresets: [],
  conversationAIBinds: [],
  automationRules: [],
  automationJobs: [],
  worldbooks: [],
  personas: [],
  relationships: [],
  contextBindings: [],
  messageStates: [],
  blacklists: [],
  offlineModes: [],
  dataJobs: [],
  audits: []
};

export function createStore(filePath) {
  ensureFile(filePath);

  function read() {
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw || "{}");
  }

  function write(data) {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
  }

  function tx(mutator) {
    const db = read();
    const next = mutator(db) || db;
    write(next);
    return next;
  }

  return { read, write, tx };
}

function ensureFile(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify(initialState, null, 2), "utf8");
    return;
  }
  const existing = fs.readFileSync(filePath, "utf8");
  if (!existing.trim()) {
    fs.writeFileSync(filePath, JSON.stringify(initialState, null, 2), "utf8");
    return;
  }
  const parsed = JSON.parse(existing);
  let changed = false;
  for (const [k, v] of Object.entries(initialState)) {
    if (!Object.prototype.hasOwnProperty.call(parsed, k)) {
      parsed[k] = v;
      changed = true;
    }
  }
  const legacy = parsed.activationCodes.find(
    (x) => (x.code || "").trim().toUpperCase() === "PIXEL-2026-DEMO"
  );
  if (legacy) {
    legacy.code = "PIXEL-2026";
    legacy.maxUses = 999999;
    changed = true;
  }
  const hasNewTestCode = parsed.activationCodes.some(
    (x) => (x.code || "").trim().toUpperCase() === "PIXEL-2026"
  );
  if (!hasNewTestCode) {
    parsed.activationCodes.push({
      id: uuidv4(),
      code: "PIXEL-2026",
      status: "active",
      maxUses: 999999,
      usedCount: 0,
      expireAt: null,
      channel: "default"
    });
    changed = true;
  }
  if (changed) {
    fs.writeFileSync(filePath, JSON.stringify(parsed, null, 2), "utf8");
  }
}
