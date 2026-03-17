import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

const isServerless =
  Boolean(process.env.VERCEL) ||
  Boolean(process.env.NETLIFY) ||
  Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME) ||
  Boolean(process.env.LAMBDA_TASK_ROOT)

function resolveTempRoot() {
  return process.env.TMPDIR || process.env.TEMP || process.env.TMP || os.tmpdir() || '/tmp'
}

function resolveRuntimeDataDir() {
  if (isServerless) {
    return path.resolve(resolveTempRoot(), 'pixel-phone-simulator-data')
  }
  return path.resolve(process.cwd(), 'data')
}

let runtimeDataDir = resolveRuntimeDataDir()
const runtimeDataFile = path.join(runtimeDataDir, 'store.json')
const bundledDataFile = path.resolve(process.cwd(), 'services', 'api', 'data', 'store.json')

function nowIso() {
  return new Date().toISOString()
}

export function createInitialState() {
  return {
    roles: [],
    worldBooks: [],
    apiConfig: {
      baseUrl: '',
      model: '',
      apiKeyEncrypted: '',
      headers: {},
    },
    chatUiSettings: {
      showTimestamp: true,
      showSeconds: false,
      timestampStyle: 'bubble',
      showReadReceipt: true,
      readReceiptStyle: 'bubble',
      hideAvatarMode: 'none',
      myBubbleColor: '#4c1d95',
      friendBubbleColor: '#312e81',
      buttonBipEnabled: true,
    },
    userPersona: {
      readableMemory: '',
      privateMemory: '',
      allowPrivateForAI: false,
    },
    license: {
      activated: false,
      activatedAt: '',
      deviceId: '',
      nickname: '',
    },
    automationSettings: {
      autoMessageEnabled: false,
      autoMessageIntervalMinutes: 15,
      autoMessageRoleIds: [],
      keepAliveEnabled: false,
      autoSummaryEnabled: true,
      autoSummaryRounds: 6,
      lastAutoMessageAt: {},
    },
    conversations: {},
  }
}

function ensureDataFile() {
  try {
    if (!fs.existsSync(runtimeDataDir)) {
      fs.mkdirSync(runtimeDataDir, { recursive: true })
    }
    if (!fs.existsSync(runtimeDataFile)) {
      if (isServerless && fs.existsSync(bundledDataFile)) {
        fs.copyFileSync(bundledDataFile, runtimeDataFile)
        return
      }
      fs.writeFileSync(runtimeDataFile, JSON.stringify(createInitialState(), null, 2), 'utf8')
    }
  } catch (error) {
    // In serverless environments cwd may be read-only; force fallback to temp dir.
    const fallbackDir = path.resolve(resolveTempRoot(), 'pixel-phone-simulator-data')
    runtimeDataDir = fallbackDir
    if (!fs.existsSync(runtimeDataDir)) {
      fs.mkdirSync(runtimeDataDir, { recursive: true })
    }
    const fallbackFile = path.join(runtimeDataDir, 'store.json')
    if (!fs.existsSync(fallbackFile)) {
      if (isServerless && fs.existsSync(bundledDataFile)) {
        fs.copyFileSync(bundledDataFile, fallbackFile)
      } else {
        fs.writeFileSync(fallbackFile, JSON.stringify(createInitialState(), null, 2), 'utf8')
      }
    }
  }
}

export function loadStore() {
  ensureDataFile()
  const file = path.join(runtimeDataDir, 'store.json')
  const content = fs.readFileSync(file, 'utf8')
  const parsed = JSON.parse(content)
  return {
    ...createInitialState(),
    ...parsed,
  }
}

export function saveStore(nextStore) {
  ensureDataFile()
  const file = path.join(runtimeDataDir, 'store.json')
  fs.writeFileSync(file, JSON.stringify(nextStore, null, 2), 'utf8')
}

export function upsertRole(store, roleInput, roleId) {
  const now = nowIso()
  if (roleId) {
    const index = store.roles.findIndex((item) => item.id === roleId)
    if (index < 0) {
      throw new Error('角色不存在')
    }
    const current = store.roles[index]
    const updated = {
      ...current,
      ...roleInput,
      persona: {
        ...current.persona,
        ...roleInput.persona,
      },
      updatedAt: now,
    }
    store.roles[index] = updated
    return updated
  }

  const created = {
    id: `role-${randomUUID()}`,
    ...roleInput,
    createdAt: now,
    updatedAt: now,
  }
  store.roles.push(created)
  return created
}

export function appendConversationMessage(store, sessionId, roleId, message) {
  if (!store.conversations[sessionId]) {
    store.conversations[sessionId] = {
      sessionId,
      roleId,
      worldBookId: '',
      messages: [],
      memory: {
        summary: '',
        facts: [],
      },
    }
  }

  store.conversations[sessionId].messages.push(message)
  store.conversations[sessionId].roleId = roleId
  return store.conversations[sessionId]
}

export function upsertWorldBook(store, input, worldBookId) {
  const now = nowIso()
  if (worldBookId) {
    const index = store.worldBooks.findIndex((item) => item.id === worldBookId)
    if (index < 0) {
      throw new Error('世界书不存在')
    }
    const updated = {
      ...store.worldBooks[index],
      name: String(input.name || '').trim() || '未命名世界书',
      content: String(input.content || '').trim(),
      updatedAt: now,
    }
    store.worldBooks[index] = updated
    return updated
  }

  const created = {
    id: `worldbook-${randomUUID()}`,
    name: String(input.name || '').trim() || '未命名世界书',
    content: String(input.content || '').trim(),
    createdAt: now,
    updatedAt: now,
  }
  store.worldBooks.push(created)
  return created
}
