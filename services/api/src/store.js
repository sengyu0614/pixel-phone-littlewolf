import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

const isServerless = process.env.VERCEL === '1' || process.env.NETLIFY === 'true'
const runtimeDataDir = isServerless
  ? path.resolve(process.env.TMPDIR || process.env.TEMP || '/tmp', 'pixel-phone-simulator-data')
  : path.resolve(process.cwd(), 'data')
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
}

export function loadStore() {
  ensureDataFile()
  const content = fs.readFileSync(runtimeDataFile, 'utf8')
  const parsed = JSON.parse(content)
  return {
    ...createInitialState(),
    ...parsed,
  }
}

export function saveStore(nextStore) {
  ensureDataFile()
  fs.writeFileSync(runtimeDataFile, JSON.stringify(nextStore, null, 2), 'utf8')
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
