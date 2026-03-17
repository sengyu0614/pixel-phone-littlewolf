import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { randomUUID } from 'node:crypto'
import {
  appendConversationMessage,
  createInitialState,
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
const defaultActivationCode = String(process.env.ACTIVATION_CODE || 'LITTLEWOLF2026').trim().toUpperCase()

app.use(cors())
app.use(express.json({ limit: '1mb' }))
app.use((req, res, next) => {
  const incomingRequestId = String(req.headers['x-request-id'] || '').trim()
  const requestId = incomingRequestId || randomUUID()
  req.requestId = requestId
  res.setHeader('x-request-id', requestId)
  next()
})

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

function logError(scope, error, requestId = 'unknown', extra = {}) {
  const message = error instanceof Error ? error.message : String(error)
  const stack = error instanceof Error ? error.stack : undefined
  console.error(`[${scope}]`, { requestId, message, stack, ...extra })
}

function getRequestId(req) {
  return String(req.requestId || 'unknown')
}

function sendError(req, res, status, code, message) {
  return res.status(status).json({
    code,
    message,
    requestId: getRequestId(req),
    ts: new Date().toISOString(),
  })
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

function sanitizeAutomationSettings(input) {
  const value = input || {}
  const interval = Math.max(1, Number(value.autoMessageIntervalMinutes) || 15)
  const rounds = Math.max(2, Number(value.autoSummaryRounds) || 6)
  const roleIds = Array.isArray(value.autoMessageRoleIds)
    ? value.autoMessageRoleIds.map((item) => String(item || '').trim()).filter(Boolean)
    : []
  const lastAutoMessageAt =
    value.lastAutoMessageAt && typeof value.lastAutoMessageAt === 'object' && !Array.isArray(value.lastAutoMessageAt)
      ? Object.fromEntries(
          Object.entries(value.lastAutoMessageAt).map(([roleId, iso]) => [String(roleId), String(iso || '')]),
        )
      : {}
  return {
    autoMessageEnabled: Boolean(value.autoMessageEnabled),
    autoMessageIntervalMinutes: interval,
    autoMessageRoleIds: Array.from(new Set(roleIds)),
    keepAliveEnabled: Boolean(value.keepAliveEnabled),
    autoSummaryEnabled: value.autoSummaryEnabled === undefined ? true : Boolean(value.autoSummaryEnabled),
    autoSummaryRounds: rounds,
    lastAutoMessageAt,
  }
}

function buildConversationSummary(messages, rounds) {
  const latest = messages.slice(-Math.max(2, Math.min(8, rounds)))
  return latest
    .map((item) => `${item.role === 'user' ? '我' : 'TA'}：${String(item.content || '').trim()}`)
    .join(' | ')
    .slice(0, 240)
}

function runAutomationTick() {
  try {
    const store = loadStore()
    const settings = sanitizeAutomationSettings(store.automationSettings)
    if (!settings.autoMessageEnabled || settings.autoMessageRoleIds.length === 0) {
      return
    }
    const now = Date.now()
    const intervalMs = settings.autoMessageIntervalMinutes * 60 * 1000
    let changed = false
    for (const roleId of settings.autoMessageRoleIds) {
      const role = store.roles.find((item) => item.id === roleId)
      if (!role) continue
      const lastIso = settings.lastAutoMessageAt[roleId] || ''
      const lastMs = lastIso ? new Date(lastIso).getTime() : 0
      if (lastMs && Number.isFinite(lastMs) && now - lastMs < intervalMs) {
        continue
      }
      const sessionId = `session-${roleId}`
      const lines = ['在吗？', '今天过得怎么样', '我刚刚想到你了', '记得按时休息哦']
      const content = lines[Math.floor(Math.random() * lines.length)] || '来和你打个招呼'
      appendConversationMessage(store, sessionId, roleId, {
        role: 'assistant',
        content,
        timestamp: new Date().toISOString(),
      })
      settings.lastAutoMessageAt[roleId] = new Date(now).toISOString()
      const session = store.conversations[sessionId]
      if (settings.autoSummaryEnabled && session?.messages?.length) {
        const rounds = Math.max(2, settings.autoSummaryRounds)
        if (session.messages.length % rounds === 0) {
          session.memory = session.memory || { summary: '', facts: [] }
          session.memory.summary = buildConversationSummary(session.messages, rounds)
        }
      }
      changed = true
    }
    if (!changed) return
    store.automationSettings = {
      ...settings,
      lastAutoMessageAt: settings.lastAutoMessageAt,
    }
    saveStore(store)
  } catch (error) {
    logError('automation:tick', error)
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

app.get('/api/license/status', (_req, res) => {
  const store = loadStore()
  const license = store.license || {}
  res.json({
    activated: Boolean(license.activated),
    activatedAt: String(license.activatedAt || ''),
    nickname: String(license.nickname || ''),
  })
})

app.post('/api/license/activate', (req, res) => {
  try {
    const store = loadStore()
    const code = String(req.body?.code || '')
      .trim()
      .toUpperCase()
    const deviceId = String(req.body?.deviceId || '').trim()
    const nickname = String(req.body?.nickname || '').trim()

    if (!code) {
      return sendError(req, res, 400, 'invalid_request', '激活码不能为空')
    }
    if (code !== defaultActivationCode) {
      return sendError(req, res, 400, 'invalid_code', '激活码无效')
    }

    store.license = {
      activated: true,
      activatedAt: store.license?.activatedAt || new Date().toISOString(),
      deviceId,
      nickname,
    }
    saveStore(store)
    return res.json({
      ok: true,
      activated: true,
      activatedAt: store.license.activatedAt,
      nickname: store.license.nickname,
    })
  } catch (error) {
    logError('license:activate', error, getRequestId(req))
    return sendError(req, res, 500, 'activation_failed', '激活失败，请稍后再试')
  }
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
    logError('worldbooks:create', error, getRequestId(req))
    return sendError(req, res, 400, 'invalid_request', error instanceof Error ? error.message : '创建世界书失败')
  }
})

app.post('/api/roles', (req, res) => {
  try {
    const store = loadStore()
    const created = upsertRole(store, sanitizeRoleInput(req.body))
    saveStore(store)
    res.status(201).json({ role: created })
  } catch (error) {
    logError('roles:create', error, getRequestId(req))
    return sendError(req, res, 400, 'invalid_request', error instanceof Error ? error.message : '创建角色失败')
  }
})

app.put('/api/roles/:roleId', (req, res) => {
  try {
    const store = loadStore()
    const updated = upsertRole(store, sanitizeRoleInput(req.body), req.params.roleId)
    saveStore(store)
    res.json({ role: updated })
  } catch (error) {
    logError('roles:update', error, getRequestId(req))
    return sendError(req, res, 400, 'invalid_request', error instanceof Error ? error.message : '更新角色失败')
  }
})

app.put('/api/roles/:roleId/worldbook', (req, res) => {
  try {
    const store = loadStore()
    const role = store.roles.find((item) => item.id === req.params.roleId)
    if (!role) {
      return sendError(req, res, 404, 'not_found', '角色不存在')
    }
    const worldBookId = String(req.body?.worldBookId || '').trim()
    if (worldBookId && !store.worldBooks.find((item) => item.id === worldBookId)) {
      return sendError(req, res, 400, 'invalid_request', '世界书不存在')
    }
    role.worldBookId = worldBookId
    role.updatedAt = new Date().toISOString()
    saveStore(store)
    return res.json({ ok: true, role })
  } catch (error) {
    logError('roles:bind-worldbook', error, getRequestId(req))
    return sendError(req, res, 400, 'invalid_request', error instanceof Error ? error.message : '绑定失败')
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
    logError('chat-settings:update', error, getRequestId(req))
    return sendError(
      req,
      res,
      400,
      'invalid_request',
      error instanceof Error ? error.message : '保存聊天设置失败',
    )
  }
})

app.get('/api/user-persona', (_req, res) => {
  const store = loadStore()
  res.json(store.userPersona || { readableMemory: '', privateMemory: '', allowPrivateForAI: false })
})

app.get('/api/automation/settings', (_req, res) => {
  const store = loadStore()
  res.json(sanitizeAutomationSettings(store.automationSettings))
})

app.put('/api/automation/settings', (req, res) => {
  try {
    const store = loadStore()
    const nextSettings = sanitizeAutomationSettings(req.body)
    store.automationSettings = nextSettings
    saveStore(store)
    res.json({ ok: true, automationSettings: nextSettings })
  } catch (error) {
    logError('automation-settings:update', error, getRequestId(req))
    return sendError(
      req,
      res,
      400,
      'invalid_request',
      error instanceof Error ? error.message : '保存自动化设置失败',
    )
  }
})

app.put('/api/user-persona', (req, res) => {
  try {
    const store = loadStore()
    const userPersona = sanitizeUserPersona(req.body)
    store.userPersona = userPersona
    saveStore(store)
    res.json({ ok: true, userPersona })
  } catch (error) {
    logError('user-persona:update', error, getRequestId(req))
    return sendError(
      req,
      res,
      400,
      'invalid_request',
      error instanceof Error ? error.message : '保存用户人设失败',
    )
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
    return sendError(req, res, 400, 'invalid_request', 'roleId/sessionId/message 必填')
  }

  const store = loadStore()
  const role = store.roles.find((item) => item.id === roleId)
  if (!role) {
    return sendError(req, res, 404, 'not_found', '角色不存在')
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
    logError('chat', error, getRequestId(req))
    const status = Number(error?.status || 500)
    const code = String(error?.code || 'unknown_error')
    const messageText = error instanceof Error ? error.message : '请求失败'
    return sendError(req, res, status, code, messageText)
  }
})

app.put('/api/sessions/:sessionId/worldbook', (req, res) => {
  try {
    const store = loadStore()
    const sessionId = String(req.params.sessionId || '').trim()
    const roleId = String(req.body?.roleId || '').trim()
    const worldBookId = String(req.body?.worldBookId || '').trim()
    if (!sessionId || !roleId) {
      return sendError(req, res, 400, 'invalid_request', 'sessionId/roleId 必填')
    }
    if (worldBookId && !store.worldBooks.find((item) => item.id === worldBookId)) {
      return sendError(req, res, 400, 'invalid_request', '世界书不存在')
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
    logError('sessions:bind-worldbook', error, getRequestId(req))
    return sendError(req, res, 400, 'invalid_request', error instanceof Error ? error.message : '绑定失败')
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

app.get('/api/sessions', (_req, res) => {
  const store = loadStore()
  res.json({ conversations: store.conversations || {} })
})

app.post('/api/import', (req, res) => {
  try {
    const payload = req.body?.data ?? req.body
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return sendError(req, res, 400, 'invalid_request', '导入数据格式无效')
    }
    const current = loadStore()
    const imported = payload
    const base = createInitialState()
    const nextStore = {
      ...base,
      ...current,
      ...imported,
      apiConfig: {
        ...base.apiConfig,
        ...current.apiConfig,
        ...(imported.apiConfig && typeof imported.apiConfig === 'object' ? imported.apiConfig : {}),
      },
      chatUiSettings: {
        ...base.chatUiSettings,
        ...current.chatUiSettings,
        ...(imported.chatUiSettings && typeof imported.chatUiSettings === 'object'
          ? imported.chatUiSettings
          : {}),
      },
      userPersona: {
        ...base.userPersona,
        ...current.userPersona,
        ...(imported.userPersona && typeof imported.userPersona === 'object' ? imported.userPersona : {}),
      },
      license: {
        ...base.license,
        ...current.license,
        ...(imported.license && typeof imported.license === 'object' ? imported.license : {}),
      },
      roles: Array.isArray(imported.roles) ? imported.roles : current.roles,
      worldBooks: Array.isArray(imported.worldBooks) ? imported.worldBooks : current.worldBooks,
      conversations:
        imported.conversations && typeof imported.conversations === 'object'
          ? imported.conversations
          : current.conversations,
    }
    saveStore(nextStore)
    return res.json({
      ok: true,
      roles: nextStore.roles.length,
      worldBooks: nextStore.worldBooks.length,
      conversations: Object.keys(nextStore.conversations || {}).length,
    })
  } catch (error) {
    logError('data:import', error, getRequestId(req))
    return sendError(req, res, 400, 'import_failed', '导入失败，请检查 JSON 文件')
  }
})

app.delete('/api/purge', (req, res) => {
  try {
    const confirmText = String(req.body?.confirmText || '').trim()
    if (confirmText !== 'PURGE_ALL') {
      return sendError(req, res, 400, 'invalid_request', '请确认清空指令')
    }
    const current = loadStore()
    const resetStore = createInitialState()
    resetStore.license = {
      ...resetStore.license,
      ...(current.license || {}),
    }
    saveStore(resetStore)
    return res.json({ ok: true })
  } catch (error) {
    logError('data:purge', error, getRequestId(req))
    return sendError(req, res, 500, 'purge_failed', '清空失败，请稍后重试')
  }
})

const isServerlessRuntime =
  Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME) ||
  Boolean(process.env.LAMBDA_TASK_ROOT) ||
  Boolean(process.env.NETLIFY)

const isDirectRun =
  !isServerlessRuntime &&
  /[\\/]server\.(mjs|cjs|js)$/.test(String(process.argv[1] || ''))

if (isDirectRun) {
  setInterval(runAutomationTick, 15000)
  app.listen(port, () => {
    console.log(`roleplay api running on http://localhost:${port}`)
  })
}

export default app
