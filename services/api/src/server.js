import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import {
  appendConversationMessage,
  loadStore,
  saveStore,
  upsertRole,
  upsertWorldBook,
} from './store.js'
import { decryptSecret, encryptSecret, maskSecret } from './security.js'
import { buildChatMessages } from './promptBuilder.js'
import { updateMemoryFromConversation } from './memory.js'
import { callOpenAiLikeChatCompletion } from './openaiLike.js'

const app = express()
const port = Number(process.env.PORT || 8787)
const appSecret = process.env.APP_SECRET || ''
const defaultApiBaseUrl = String(process.env.DEFAULT_API_BASE_URL || '').trim()
const defaultApiModel = String(process.env.DEFAULT_API_MODEL || '').trim()

app.use(cors())
app.use(express.json({ limit: '1mb' }))

function sanitizeRoleInput(input) {
  const persona = input.persona || {}
  return {
    name: String(input.name || '').trim() || '未命名角色',
    avatar: String(input.avatar || 'AI').trim().slice(0, 8),
    description: String(input.description || '').trim(),
    worldBookId: String(input.worldBookId || '').trim(),
    persona: {
      identity: String(persona.identity || '').trim(),
      relationship: String(persona.relationship || '').trim(),
      speakingStyle: String(persona.speakingStyle || '').trim(),
      values: String(persona.values || '').trim(),
      boundaries: String(persona.boundaries || '').trim(),
      worldview: String(persona.worldview || '').trim(),
      sampleDialogues: Array.isArray(persona.sampleDialogues)
        ? persona.sampleDialogues.slice(0, 6).map((item) => ({
            user: String(item.user || '').trim(),
            assistant: String(item.assistant || '').trim(),
          }))
        : [],
    },
  }
}

function logError(scope, error) {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`[${scope}]`, message)
}

function sanitizeChatUiSettings(input) {
  const value = input || {}
  const allowedTimestampStyle = ['bubble', 'avatar', 'hidden']
  const allowedReadStyle = ['bubble', 'avatar', 'hidden']
  const allowedHideAvatarMode = ['none', 'both', 'friend', 'me']
  const clampColor = (raw, fallback) => {
    const str = String(raw || '').trim()
    if (/^#[0-9a-fA-F]{6}$/.test(str)) return str
    return fallback
  }
  return {
    showTimestamp: Boolean(value.showTimestamp),
    showSeconds: Boolean(value.showSeconds),
    timestampStyle: allowedTimestampStyle.includes(value.timestampStyle) ? value.timestampStyle : 'bubble',
    showReadReceipt: Boolean(value.showReadReceipt),
    readReceiptStyle: allowedReadStyle.includes(value.readReceiptStyle) ? value.readReceiptStyle : 'bubble',
    hideAvatarMode: allowedHideAvatarMode.includes(value.hideAvatarMode) ? value.hideAvatarMode : 'none',
    myBubbleColor: clampColor(value.myBubbleColor, '#4c1d95'),
    friendBubbleColor: clampColor(value.friendBubbleColor, '#312e81'),
    buttonBipEnabled: value.buttonBipEnabled === undefined ? true : Boolean(value.buttonBipEnabled),
  }
}

function sanitizeUserPersona(input) {
  const value = input || {}
  return {
    readableMemory: String(value.readableMemory || '').trim(),
    privateMemory: String(value.privateMemory || '').trim(),
    allowPrivateForAI: Boolean(value.allowPrivateForAI),
  }
}

function resolveApiConfig(store) {
  return {
    baseUrl: String(store.apiConfig?.baseUrl || '').trim() || defaultApiBaseUrl,
    model: String(store.apiConfig?.model || '').trim() || defaultApiModel,
    headers: store.apiConfig?.headers || {},
  }
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, ts: new Date().toISOString() })
})

app.get('/api/roles', (_req, res) => {
  const store = loadStore()
  res.json({ roles: store.roles })
})

app.get('/api/worldbooks', (_req, res) => {
  const store = loadStore()
  res.json({ worldBooks: store.worldBooks || [] })
})

app.post('/api/worldbooks', (req, res) => {
  try {
    const store = loadStore()
    const worldBook = upsertWorldBook(store, req.body)
    saveStore(store)
    res.status(201).json({ worldBook })
  } catch (error) {
    logError('worldbooks:create', error)
    res.status(400).json({ message: error instanceof Error ? error.message : '创建世界书失败' })
  }
})

app.post('/api/roles', (req, res) => {
  try {
    const store = loadStore()
    const created = upsertRole(store, sanitizeRoleInput(req.body))
    saveStore(store)
    res.status(201).json({ role: created })
  } catch (error) {
    logError('roles:create', error)
    res.status(400).json({ message: error instanceof Error ? error.message : '创建角色失败' })
  }
})

app.put('/api/roles/:roleId', (req, res) => {
  try {
    const store = loadStore()
    const updated = upsertRole(store, sanitizeRoleInput(req.body), req.params.roleId)
    saveStore(store)
    res.json({ role: updated })
  } catch (error) {
    logError('roles:update', error)
    res.status(400).json({ message: error instanceof Error ? error.message : '更新角色失败' })
  }
})

app.put('/api/roles/:roleId/worldbook', (req, res) => {
  try {
    const store = loadStore()
    const role = store.roles.find((item) => item.id === req.params.roleId)
    if (!role) {
      return res.status(404).json({ code: 'not_found', message: '角色不存在' })
    }
    const worldBookId = String(req.body?.worldBookId || '').trim()
    if (worldBookId && !store.worldBooks.find((item) => item.id === worldBookId)) {
      return res.status(400).json({ code: 'invalid_request', message: '世界书不存在' })
    }
    role.worldBookId = worldBookId
    role.updatedAt = new Date().toISOString()
    saveStore(store)
    return res.json({ ok: true, role })
  } catch (error) {
    logError('roles:bind-worldbook', error)
    return res.status(400).json({ message: error instanceof Error ? error.message : '绑定失败' })
  }
})

app.get('/api/config', (_req, res) => {
  const store = loadStore()
  const apiKey = decryptSecret(store.apiConfig.apiKeyEncrypted, appSecret)
  const resolved = resolveApiConfig(store)
  res.json({
    baseUrl: resolved.baseUrl,
    model: resolved.model,
    headers: resolved.headers,
    hasApiKey: Boolean(apiKey),
    maskedApiKey: maskSecret(apiKey),
  })
})

app.get('/api/chat-settings', (_req, res) => {
  const store = loadStore()
  res.json(store.chatUiSettings || {})
})

app.put('/api/chat-settings', (req, res) => {
  try {
    const store = loadStore()
    const nextSettings = sanitizeChatUiSettings(req.body)
    store.chatUiSettings = nextSettings
    saveStore(store)
    res.json({ ok: true, chatUiSettings: nextSettings })
  } catch (error) {
    logError('chat-settings:update', error)
    res.status(400).json({ message: error instanceof Error ? error.message : '保存聊天设置失败' })
  }
})

app.get('/api/user-persona', (_req, res) => {
  const store = loadStore()
  res.json(store.userPersona || { readableMemory: '', privateMemory: '', allowPrivateForAI: false })
})

app.put('/api/user-persona', (req, res) => {
  try {
    const store = loadStore()
    const userPersona = sanitizeUserPersona(req.body)
    store.userPersona = userPersona
    saveStore(store)
    res.json({ ok: true, userPersona })
  } catch (error) {
    logError('user-persona:update', error)
    res.status(400).json({ message: error instanceof Error ? error.message : '保存用户人设失败' })
  }
})

app.put('/api/config', (req, res) => {
  const body = req.body || {}
  const store = loadStore()

  const baseUrl = String(body.baseUrl || '').trim()
  const model = String(body.model || '').trim()
  const apiKey = String(body.apiKey || '').trim()
  const headers =
    body.headers && typeof body.headers === 'object' && !Array.isArray(body.headers)
      ? Object.fromEntries(
          Object.entries(body.headers).map(([key, value]) => [String(key), String(value)]),
        )
      : {}

  store.apiConfig.baseUrl = baseUrl
  store.apiConfig.model = model
  store.apiConfig.headers = headers
  if (apiKey) {
    store.apiConfig.apiKeyEncrypted = encryptSecret(apiKey, appSecret)
  }
  saveStore(store)
  res.json({
    ok: true,
    hasApiKey: Boolean(store.apiConfig.apiKeyEncrypted),
    maskedApiKey: maskSecret(apiKey),
  })
})

app.post('/api/chat', async (req, res) => {
  const body = req.body || {}
  const roleId = String(body.roleId || '').trim()
  const sessionId = String(body.sessionId || '').trim()
  const message = String(body.message || '').trim()

  if (!roleId || !sessionId || !message) {
    return res.status(400).json({ code: 'invalid_request', message: 'roleId/sessionId/message 必填' })
  }

  const store = loadStore()
  const role = store.roles.find((item) => item.id === roleId)
  if (!role) {
    return res.status(404).json({ code: 'not_found', message: '角色不存在' })
  }

  const apiKey = decryptSecret(store.apiConfig.apiKeyEncrypted, appSecret)
  const resolved = resolveApiConfig(store)
  const config = {
    baseUrl: resolved.baseUrl,
    model: resolved.model,
    apiKey,
    headers: resolved.headers,
  }

  try {
    const conversation = appendConversationMessage(store, sessionId, roleId, {
      role: 'user',
      content: message,
      timestamp: new Date().toISOString(),
    })

    const roleWorldBook =
      role.worldBookId && store.worldBooks
        ? store.worldBooks.find((item) => item.id === role.worldBookId) || null
        : null
    const sessionWorldBook =
      conversation.worldBookId && store.worldBooks
        ? store.worldBooks.find((item) => item.id === conversation.worldBookId) || null
        : null
    const requestMessages = buildChatMessages(
      role,
      conversation.memory,
      conversation.messages,
      roleWorldBook,
      sessionWorldBook,
      store.userPersona || null,
      '我',
    )
    const reply = await callOpenAiLikeChatCompletion(config, requestMessages)
    appendConversationMessage(store, sessionId, roleId, {
      role: 'assistant',
      content: reply,
      timestamp: new Date().toISOString(),
    })

    const updatedConversation = store.conversations[sessionId]
    updatedConversation.memory = updateMemoryFromConversation(
      updatedConversation.memory,
      updatedConversation.messages,
    )

    saveStore(store)
    return res.json({
      reply,
      role,
      sessionId,
      sessionWorldBookId: updatedConversation.worldBookId || '',
      memory: updatedConversation.memory,
      conversation: updatedConversation.messages.slice(-24),
    })
  } catch (error) {
    logError('chat', error)
    const status = Number(error?.status || 500)
    const code = String(error?.code || 'unknown_error')
    const messageText = error instanceof Error ? error.message : '请求失败'
    return res.status(status).json({ code, message: messageText })
  }
})

app.put('/api/sessions/:sessionId/worldbook', (req, res) => {
  try {
    const store = loadStore()
    const sessionId = String(req.params.sessionId || '').trim()
    const roleId = String(req.body?.roleId || '').trim()
    const worldBookId = String(req.body?.worldBookId || '').trim()
    if (!sessionId || !roleId) {
      return res.status(400).json({ code: 'invalid_request', message: 'sessionId/roleId 必填' })
    }
    if (worldBookId && !store.worldBooks.find((item) => item.id === worldBookId)) {
      return res.status(400).json({ code: 'invalid_request', message: '世界书不存在' })
    }
    if (!store.conversations[sessionId]) {
      store.conversations[sessionId] = {
        sessionId,
        roleId,
        worldBookId: '',
        messages: [],
        memory: { summary: '', facts: [] },
      }
    }
    store.conversations[sessionId].roleId = roleId
    store.conversations[sessionId].worldBookId = worldBookId
    saveStore(store)
    return res.json({ ok: true, sessionId, worldBookId })
  } catch (error) {
    logError('sessions:bind-worldbook', error)
    return res.status(400).json({ message: error instanceof Error ? error.message : '绑定失败' })
  }
})

app.get('/api/export', (_req, res) => {
  const store = loadStore()
  const sanitized = {
    ...store,
    apiConfig: {
      ...store.apiConfig,
      apiKeyEncrypted: '',
      exportedAt: new Date().toISOString(),
    },
  }
  res.json(sanitized)
})

const isServerlessRuntime =
  Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME) ||
  Boolean(process.env.LAMBDA_TASK_ROOT) ||
  Boolean(process.env.NETLIFY)

const isDirectRun =
  !isServerlessRuntime &&
  /[\\/]server\.(mjs|cjs|js)$/.test(String(process.argv[1] || ''))

if (isDirectRun) {
  app.listen(port, () => {
    console.log(`roleplay api running on http://localhost:${port}`)
  })
}

export default app
