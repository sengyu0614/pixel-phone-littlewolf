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
app.use(express.json({ limit: '50mb' }))
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

function sanitizeMomentInput(input) {
  const value = input || {}
  const images = Array.isArray(value.images)
    ? value.images.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 9)
    : []
  return {
    roleId: String(value.roleId || '').trim(),
    content: String(value.content || '').trim(),
    images,
  }
}

function normalizeForumSection(raw) {
  const section = String(raw || '').trim()
  if (section === 'follow' || section === 'gossip') return section
  return 'recommend'
}

function sanitizeForumInput(input) {
  const value = input || {}
  const tags = Array.isArray(value.tags)
    ? value.tags.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 6)
    : []
  return {
    roleId: String(value.roleId || '').trim(),
    title: String(value.title || '').trim(),
    content: String(value.content || '').trim(),
    section: normalizeForumSection(value.section),
    tags,
  }
}

function sanitizeMusicTrackInput(input) {
  const value = input || {}
  return {
    name: String(value.name || '').trim(),
    artist: String(value.artist || '').trim() || '未知歌手',
    durationSec: Math.max(0, Math.min(36000, Number(value.durationSec) || 0)),
  }
}

function sanitizeSongUploadInput(input) {
  const value = input || {}
  const dataUrl = String(value.dataUrl || '').trim()
  return {
    fileName: String(value.fileName || '').trim(),
    mimeType: String(value.mimeType || '').trim() || 'audio/mpeg',
    size: Math.max(0, Number(value.size) || 0),
    dataUrl,
  }
}

function sanitizeSongUploadInitInput(input) {
  const value = input || {}
  return {
    fileName: String(value.fileName || '').trim(),
    mimeType: String(value.mimeType || '').trim() || 'audio/mpeg',
    size: Math.max(0, Number(value.size) || 0),
  }
}

function sanitizeSongUploadChunkInput(input) {
  const value = input || {}
  return {
    uploadId: String(value.uploadId || '').trim(),
    chunkIndex: Math.max(0, Number(value.chunkIndex) || 0),
    totalChunks: Math.max(0, Number(value.totalChunks) || 0),
    chunkBase64: String(value.chunkBase64 || '').trim(),
  }
}

function sanitizeSongUploadCompleteInput(input) {
  const value = input || {}
  return {
    uploadId: String(value.uploadId || '').trim(),
  }
}

function sanitizeLyricsUploadInput(input) {
  const value = input || {}
  return {
    fileName: String(value.fileName || '').trim(),
    size: Math.max(0, Number(value.size) || 0),
    content: String(value.content || ''),
    linkedTrackId: String(value.linkedTrackId || '').trim(),
  }
}

function createEmptyMusicState() {
  return {
    nowPlayingTrackId: '',
    playlist: [],
    uploadedSongs: [],
    uploadedLyrics: [],
    recentPlayed: [],
    songUploadDrafts: {},
  }
}

function normalizeDeviceId(raw) {
  const value = String(raw || '').trim()
  if (!value) return ''
  if (!/^[a-zA-Z0-9._-]{4,120}$/.test(value)) return ''
  return value
}

function resolveRequestDeviceId(req) {
  const fromDeviceHeader = normalizeDeviceId(req.get('x-pixel-device-id'))
  if (fromDeviceHeader) return fromDeviceHeader
  const fromLegacyHeader = normalizeDeviceId(req.get('x-pixel-user-id'))
  if (fromLegacyHeader) return fromLegacyHeader
  return 'anonymous'
}

function getOrCreateDeviceMusicState(store, deviceId) {
  const normalizedDeviceId = normalizeDeviceId(deviceId) || 'anonymous'
  if (!store.musicDeviceBuckets || typeof store.musicDeviceBuckets !== 'object') {
    store.musicDeviceBuckets = {}
  }

  let changed = false
  if (!store.musicDeviceBuckets[normalizedDeviceId]) {
    const shouldMigrateLegacy = !store.__musicMigratedToBuckets
    if (shouldMigrateLegacy && store.music && typeof store.music === 'object') {
      const legacy = store.music
      store.musicDeviceBuckets[normalizedDeviceId] = {
        nowPlayingTrackId: String(legacy.nowPlayingTrackId || ''),
        playlist: Array.isArray(legacy.playlist) ? legacy.playlist : [],
        uploadedSongs: Array.isArray(legacy.uploadedSongs) ? legacy.uploadedSongs : [],
        uploadedLyrics: Array.isArray(legacy.uploadedLyrics) ? legacy.uploadedLyrics : [],
        recentPlayed: Array.isArray(legacy.recentPlayed) ? legacy.recentPlayed : [],
      }
      store.__musicMigratedToBuckets = true
    } else {
      store.musicDeviceBuckets[normalizedDeviceId] = createEmptyMusicState()
    }
    changed = true
  }

  const music = store.musicDeviceBuckets[normalizedDeviceId]
  music.nowPlayingTrackId = String(music.nowPlayingTrackId || '')
  music.playlist = Array.isArray(music.playlist) ? music.playlist : []
  music.uploadedSongs = Array.isArray(music.uploadedSongs) ? music.uploadedSongs : []
  music.uploadedLyrics = Array.isArray(music.uploadedLyrics) ? music.uploadedLyrics : []
  music.recentPlayed = Array.isArray(music.recentPlayed) ? music.recentPlayed : []
  music.songUploadDrafts =
    music.songUploadDrafts && typeof music.songUploadDrafts === 'object' ? music.songUploadDrafts : {}
  return { music, changed, normalizedDeviceId }
}

function getTrackNameFromFileName(fileName) {
  const normalized = String(fileName || '').trim()
  if (!normalized) return '未命名歌曲'
  const noExt = normalized.replace(/\.[^.]+$/, '')
  return noExt || '未命名歌曲'
}

function appendUploadedSongToMusic(scopedMusic, input) {
  scopedMusic.playlist = Array.isArray(scopedMusic.playlist) ? scopedMusic.playlist : []
  scopedMusic.uploadedSongs = Array.isArray(scopedMusic.uploadedSongs) ? scopedMusic.uploadedSongs : []
  const track = {
    id: `track-${randomUUID()}`,
    name: getTrackNameFromFileName(input.fileName),
    artist: '本地上传',
    durationSec: 0,
    addedAt: new Date().toISOString(),
  }
  scopedMusic.playlist.push(track)
  if (!scopedMusic.nowPlayingTrackId) {
    scopedMusic.nowPlayingTrackId = track.id
    recordRecentPlay(scopedMusic, track.id)
  }
  const uploadedSong = {
    id: `song-${randomUUID()}`,
    fileName: input.fileName,
    mimeType: input.mimeType,
    size: input.size,
    uploadedAt: new Date().toISOString(),
    trackId: track.id,
    dataUrl: input.dataUrl,
  }
  scopedMusic.uploadedSongs.unshift(uploadedSong)
  return { track, uploadedSong }
}

function recordRecentPlay(music, trackId) {
  const safeTrackId = String(trackId || '').trim()
  if (!safeTrackId) return
  const now = new Date().toISOString()
  const history = Array.isArray(music.recentPlayed) ? music.recentPlayed : []
  const next = [{ trackId: safeTrackId, playedAt: now }, ...history.filter((item) => item.trackId !== safeTrackId)]
  music.recentPlayed = next.slice(0, 30)
}

function buildPublicMusicState(music) {
  const safeMusic = music || {}
  return {
    nowPlayingTrackId: String(safeMusic.nowPlayingTrackId || ''),
    playlist: Array.isArray(safeMusic.playlist) ? safeMusic.playlist : [],
    uploadedSongs: Array.isArray(safeMusic.uploadedSongs)
      ? safeMusic.uploadedSongs.map((item) => ({
          id: String(item?.id || ''),
          fileName: String(item?.fileName || ''),
          mimeType: String(item?.mimeType || ''),
          size: Math.max(0, Number(item?.size) || 0),
          uploadedAt: String(item?.uploadedAt || ''),
          trackId: String(item?.trackId || ''),
        }))
      : [],
    uploadedLyrics: Array.isArray(safeMusic.uploadedLyrics)
      ? safeMusic.uploadedLyrics.map(({ content, ...rest }) => rest)
      : [],
    recentPlayed: Array.isArray(safeMusic.recentPlayed)
      ? safeMusic.recentPlayed
          .map((item) => ({
            trackId: String(item?.trackId || ''),
            playedAt: String(item?.playedAt || ''),
          }))
          .filter((item) => item.trackId)
      : [],
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

app.get('/api/moments/posts', (_req, res) => {
  const store = loadStore()
  const posts = Array.isArray(store.moments?.posts) ? store.moments.posts : []
  res.json({ posts })
})

app.post('/api/moments/posts', (req, res) => {
  try {
    const store = loadStore()
    const input = sanitizeMomentInput(req.body)
    if (!input.roleId || !input.content) {
      return sendError(req, res, 400, 'invalid_request', 'roleId/content 必填')
    }
    const role = store.roles.find((item) => item.id === input.roleId)
    if (!role) {
      return sendError(req, res, 404, 'not_found', '角色不存在')
    }
    store.moments = store.moments || { posts: [] }
    const post = {
      id: `moment-${randomUUID()}`,
      roleId: role.id,
      roleName: role.name,
      content: input.content,
      images: input.images,
      likes: 0,
      likedByMe: false,
      createdAt: new Date().toISOString(),
      comments: [],
    }
    store.moments.posts.unshift(post)
    saveStore(store)
    return res.status(201).json({ post })
  } catch (error) {
    logError('moments:create-post', error, getRequestId(req))
    return sendError(req, res, 400, 'invalid_request', error instanceof Error ? error.message : '发布动态失败')
  }
})

app.post('/api/moments/posts/:postId/like', (req, res) => {
  try {
    const store = loadStore()
    const posts = Array.isArray(store.moments?.posts) ? store.moments.posts : []
    const post = posts.find((item) => item.id === req.params.postId)
    if (!post) {
      return sendError(req, res, 404, 'not_found', '动态不存在')
    }
    const likedByMe = Boolean(req.body?.likedByMe)
    if (likedByMe !== Boolean(post.likedByMe)) {
      post.likes = Math.max(0, Number(post.likes || 0) + (likedByMe ? 1 : -1))
      post.likedByMe = likedByMe
      saveStore(store)
    }
    return res.json({ ok: true, post })
  } catch (error) {
    logError('moments:like-post', error, getRequestId(req))
    return sendError(req, res, 400, 'invalid_request', error instanceof Error ? error.message : '点赞失败')
  }
})

app.post('/api/moments/posts/:postId/comments', (req, res) => {
  try {
    const store = loadStore()
    const posts = Array.isArray(store.moments?.posts) ? store.moments.posts : []
    const post = posts.find((item) => item.id === req.params.postId)
    if (!post) {
      return sendError(req, res, 404, 'not_found', '动态不存在')
    }
    const roleId = String(req.body?.roleId || '').trim()
    const content = String(req.body?.content || '').trim()
    if (!roleId || !content) {
      return sendError(req, res, 400, 'invalid_request', 'roleId/content 必填')
    }
    const role = store.roles.find((item) => item.id === roleId)
    if (!role) {
      return sendError(req, res, 404, 'not_found', '角色不存在')
    }
    post.comments = Array.isArray(post.comments) ? post.comments : []
    post.comments.push({
      id: `moment-comment-${randomUUID()}`,
      roleId: role.id,
      roleName: role.name,
      content,
      createdAt: new Date().toISOString(),
    })
    saveStore(store)
    return res.json({ ok: true, post })
  } catch (error) {
    logError('moments:comment-post', error, getRequestId(req))
    return sendError(req, res, 400, 'invalid_request', error instanceof Error ? error.message : '评论失败')
  }
})

app.get('/api/forum/posts', (req, res) => {
  const store = loadStore()
  const section = String(req.query?.section || '').trim()
  const posts = Array.isArray(store.forum?.posts) ? store.forum.posts : []
  if (!section) {
    return res.json({ posts })
  }
  return res.json({ posts: posts.filter((item) => item.section === normalizeForumSection(section)) })
})

app.post('/api/forum/posts', (req, res) => {
  try {
    const store = loadStore()
    const input = sanitizeForumInput(req.body)
    if (!input.roleId || !input.title || !input.content) {
      return sendError(req, res, 400, 'invalid_request', 'roleId/title/content 必填')
    }
    const role = store.roles.find((item) => item.id === input.roleId)
    if (!role) {
      return sendError(req, res, 404, 'not_found', '角色不存在')
    }
    store.forum = store.forum || { posts: [] }
    const post = {
      id: `forum-${randomUUID()}`,
      roleId: role.id,
      roleName: role.name,
      title: input.title,
      content: input.content,
      section: input.section,
      tags: input.tags,
      likes: 0,
      likedByMe: false,
      createdAt: new Date().toISOString(),
      replies: [],
    }
    store.forum.posts.unshift(post)
    saveStore(store)
    return res.status(201).json({ post })
  } catch (error) {
    logError('forum:create-post', error, getRequestId(req))
    return sendError(req, res, 400, 'invalid_request', error instanceof Error ? error.message : '发布帖子失败')
  }
})

app.post('/api/forum/posts/:postId/like', (req, res) => {
  try {
    const store = loadStore()
    const posts = Array.isArray(store.forum?.posts) ? store.forum.posts : []
    const post = posts.find((item) => item.id === req.params.postId)
    if (!post) {
      return sendError(req, res, 404, 'not_found', '帖子不存在')
    }
    const likedByMe = Boolean(req.body?.likedByMe)
    if (likedByMe !== Boolean(post.likedByMe)) {
      post.likes = Math.max(0, Number(post.likes || 0) + (likedByMe ? 1 : -1))
      post.likedByMe = likedByMe
      saveStore(store)
    }
    return res.json({ ok: true, post })
  } catch (error) {
    logError('forum:like-post', error, getRequestId(req))
    return sendError(req, res, 400, 'invalid_request', error instanceof Error ? error.message : '点赞失败')
  }
})

app.post('/api/forum/posts/:postId/replies', (req, res) => {
  try {
    const store = loadStore()
    const posts = Array.isArray(store.forum?.posts) ? store.forum.posts : []
    const post = posts.find((item) => item.id === req.params.postId)
    if (!post) {
      return sendError(req, res, 404, 'not_found', '帖子不存在')
    }
    const roleId = String(req.body?.roleId || '').trim()
    const content = String(req.body?.content || '').trim()
    if (!roleId || !content) {
      return sendError(req, res, 400, 'invalid_request', 'roleId/content 必填')
    }
    const role = store.roles.find((item) => item.id === roleId)
    if (!role) {
      return sendError(req, res, 404, 'not_found', '角色不存在')
    }
    post.replies = Array.isArray(post.replies) ? post.replies : []
    post.replies.push({
      id: `forum-reply-${randomUUID()}`,
      roleId: role.id,
      roleName: role.name,
      content,
      createdAt: new Date().toISOString(),
    })
    saveStore(store)
    return res.json({ ok: true, post })
  } catch (error) {
    logError('forum:reply-post', error, getRequestId(req))
    return sendError(req, res, 400, 'invalid_request', error instanceof Error ? error.message : '回复失败')
  }
})

app.get('/api/music/state', (req, res) => {
  const store = loadStore()
  const { music, changed } = getOrCreateDeviceMusicState(store, resolveRequestDeviceId(req))
  if (changed) {
    saveStore(store)
  }
  return res.json(buildPublicMusicState(music))
})

app.get('/api/music/tracks/:trackId/file', (req, res) => {
  try {
    const store = loadStore()
    const { music: scopedMusic } = getOrCreateDeviceMusicState(store, resolveRequestDeviceId(req))
    const trackId = String(req.params.trackId || '').trim()
    if (!trackId) {
      return sendError(req, res, 400, 'invalid_request', 'trackId 必填')
    }
    const uploadedSongs = Array.isArray(scopedMusic.uploadedSongs) ? scopedMusic.uploadedSongs : []
    const song = uploadedSongs.find((item) => item.trackId === trackId)
    if (!song || !String(song.dataUrl || '').trim()) {
      return sendError(req, res, 404, 'not_found', '歌曲文件不存在或已失效，请重新上传')
    }
    return res.json({
      ok: true,
      trackId,
      fileName: String(song.fileName || ''),
      mimeType: String(song.mimeType || ''),
      size: Math.max(0, Number(song.size) || 0),
      dataUrl: String(song.dataUrl || ''),
    })
  } catch (error) {
    logError('music:get-track-file', error, getRequestId(req))
    return sendError(req, res, 500, 'server_error', '读取歌曲文件失败')
  }
})

app.post('/api/music/tracks', (req, res) => {
  try {
    const store = loadStore()
    const { music: scopedMusic } = getOrCreateDeviceMusicState(store, resolveRequestDeviceId(req))
    const input = sanitizeMusicTrackInput(req.body)
    if (!input.name) {
      return sendError(req, res, 400, 'invalid_request', '歌曲名称必填')
    }
    scopedMusic.playlist = Array.isArray(scopedMusic.playlist) ? scopedMusic.playlist : []
    const track = {
      id: `track-${randomUUID()}`,
      name: input.name,
      artist: input.artist,
      durationSec: input.durationSec,
      addedAt: new Date().toISOString(),
    }
    scopedMusic.playlist.push(track)
    if (!scopedMusic.nowPlayingTrackId) {
      scopedMusic.nowPlayingTrackId = track.id
      recordRecentPlay(scopedMusic, track.id)
    }
    saveStore(store)
    return res.status(201).json({ ok: true, music: buildPublicMusicState(scopedMusic) })
  } catch (error) {
    logError('music:add-track', error, getRequestId(req))
    return sendError(req, res, 400, 'invalid_request', error instanceof Error ? error.message : '添加歌曲失败')
  }
})

app.post('/api/music/upload/song', (req, res) => {
  try {
    const store = loadStore()
    const { music: scopedMusic } = getOrCreateDeviceMusicState(store, resolveRequestDeviceId(req))
    const input = sanitizeSongUploadInput(req.body)
    if (!input.fileName || !input.dataUrl) {
      return sendError(req, res, 400, 'invalid_request', 'fileName/dataUrl 必填')
    }
    if (!input.dataUrl.startsWith('data:')) {
      return sendError(req, res, 400, 'invalid_request', '歌曲文件格式无效')
    }
    const { track, uploadedSong } = appendUploadedSongToMusic(scopedMusic, input)
    saveStore(store)
    return res.status(201).json({
      ok: true,
      trackId: track.id,
      uploadedSongId: uploadedSong.id,
      music: buildPublicMusicState(scopedMusic),
    })
  } catch (error) {
    logError('music:upload-song', error, getRequestId(req))
    return sendError(req, res, 400, 'invalid_request', error instanceof Error ? error.message : '上传歌曲失败')
  }
})

app.post('/api/music/upload/song/init', (req, res) => {
  try {
    const store = loadStore()
    const { music: scopedMusic } = getOrCreateDeviceMusicState(store, resolveRequestDeviceId(req))
    const input = sanitizeSongUploadInitInput(req.body)
    if (!input.fileName || !input.size) {
      return sendError(req, res, 400, 'invalid_request', 'fileName/size 必填')
    }
    scopedMusic.songUploadDrafts =
      scopedMusic.songUploadDrafts && typeof scopedMusic.songUploadDrafts === 'object'
        ? scopedMusic.songUploadDrafts
        : {}
    const uploadId = `upload-${randomUUID()}`
    scopedMusic.songUploadDrafts[uploadId] = {
      fileName: input.fileName,
      mimeType: input.mimeType,
      size: input.size,
      totalChunks: 0,
      chunks: {},
      createdAt: new Date().toISOString(),
    }
    saveStore(store)
    return res.status(201).json({ ok: true, uploadId })
  } catch (error) {
    logError('music:upload-song:init', error, getRequestId(req))
    return sendError(req, res, 400, 'invalid_request', error instanceof Error ? error.message : '初始化上传失败')
  }
})

app.post('/api/music/upload/song/chunk', (req, res) => {
  try {
    const store = loadStore()
    const { music: scopedMusic } = getOrCreateDeviceMusicState(store, resolveRequestDeviceId(req))
    const input = sanitizeSongUploadChunkInput(req.body)
    if (!input.uploadId || !input.chunkBase64 || input.totalChunks <= 0) {
      return sendError(req, res, 400, 'invalid_request', 'uploadId/chunkBase64/totalChunks 必填')
    }
    if (!/^[A-Za-z0-9+/=]+$/.test(input.chunkBase64)) {
      return sendError(req, res, 400, 'invalid_request', 'chunkBase64 格式无效')
    }
    scopedMusic.songUploadDrafts =
      scopedMusic.songUploadDrafts && typeof scopedMusic.songUploadDrafts === 'object'
        ? scopedMusic.songUploadDrafts
        : {}
    const draft = scopedMusic.songUploadDrafts[input.uploadId]
    if (!draft || typeof draft !== 'object') {
      return sendError(req, res, 404, 'not_found', '上传会话不存在或已过期')
    }
    const totalChunks = Math.max(1, Math.min(400, input.totalChunks))
    if (input.chunkIndex < 0 || input.chunkIndex >= totalChunks) {
      return sendError(req, res, 400, 'invalid_request', 'chunkIndex 越界')
    }
    if (draft.totalChunks && draft.totalChunks !== totalChunks) {
      return sendError(req, res, 400, 'invalid_request', 'totalChunks 与会话不一致')
    }
    draft.totalChunks = totalChunks
    draft.chunks = draft.chunks && typeof draft.chunks === 'object' ? draft.chunks : {}
    draft.chunks[input.chunkIndex] = input.chunkBase64
    saveStore(store)
    return res.json({
      ok: true,
      uploadId: input.uploadId,
      chunkIndex: input.chunkIndex,
      receivedChunks: Object.keys(draft.chunks).length,
    })
  } catch (error) {
    logError('music:upload-song:chunk', error, getRequestId(req))
    return sendError(req, res, 400, 'invalid_request', error instanceof Error ? error.message : '分片上传失败')
  }
})

app.post('/api/music/upload/song/complete', (req, res) => {
  try {
    const store = loadStore()
    const { music: scopedMusic } = getOrCreateDeviceMusicState(store, resolveRequestDeviceId(req))
    const input = sanitizeSongUploadCompleteInput(req.body)
    if (!input.uploadId) {
      return sendError(req, res, 400, 'invalid_request', 'uploadId 必填')
    }
    scopedMusic.songUploadDrafts =
      scopedMusic.songUploadDrafts && typeof scopedMusic.songUploadDrafts === 'object'
        ? scopedMusic.songUploadDrafts
        : {}
    const draft = scopedMusic.songUploadDrafts[input.uploadId]
    if (!draft || typeof draft !== 'object') {
      return sendError(req, res, 404, 'not_found', '上传会话不存在或已过期')
    }
    const totalChunks = Math.max(1, Number(draft.totalChunks) || 0)
    const chunks = draft.chunks && typeof draft.chunks === 'object' ? draft.chunks : {}
    for (let index = 0; index < totalChunks; index += 1) {
      if (!chunks[index]) {
        return sendError(req, res, 400, 'invalid_request', `分片缺失：${index + 1}/${totalChunks}`)
      }
    }
    const mergedBase64 = Array.from({ length: totalChunks }, (_item, index) => String(chunks[index] || '')).join('')
    const dataUrl = `data:${String(draft.mimeType || 'audio/mpeg')};base64,${mergedBase64}`
    const { track, uploadedSong } = appendUploadedSongToMusic(scopedMusic, {
      fileName: String(draft.fileName || ''),
      mimeType: String(draft.mimeType || 'audio/mpeg'),
      size: Math.max(0, Number(draft.size) || 0),
      dataUrl,
    })
    delete scopedMusic.songUploadDrafts[input.uploadId]
    saveStore(store)
    return res.json({
      ok: true,
      trackId: track.id,
      uploadedSongId: uploadedSong.id,
      music: buildPublicMusicState(scopedMusic),
    })
  } catch (error) {
    logError('music:upload-song:complete', error, getRequestId(req))
    return sendError(req, res, 400, 'invalid_request', error instanceof Error ? error.message : '合并上传失败')
  }
})

app.post('/api/music/upload/lyrics', (req, res) => {
  try {
    const store = loadStore()
    const { music: scopedMusic } = getOrCreateDeviceMusicState(store, resolveRequestDeviceId(req))
    const input = sanitizeLyricsUploadInput(req.body)
    if (!input.fileName || !input.content.trim()) {
      return sendError(req, res, 400, 'invalid_request', 'fileName/content 必填')
    }
    scopedMusic.playlist = Array.isArray(scopedMusic.playlist) ? scopedMusic.playlist : []
    scopedMusic.uploadedLyrics = Array.isArray(scopedMusic.uploadedLyrics) ? scopedMusic.uploadedLyrics : []
    const linkedTrackId =
      input.linkedTrackId && scopedMusic.playlist.find((item) => item.id === input.linkedTrackId)
        ? input.linkedTrackId
        : scopedMusic.nowPlayingTrackId || scopedMusic.playlist[0]?.id || ''
    const uploadedLyrics = {
      id: `lyrics-${randomUUID()}`,
      fileName: input.fileName,
      size: input.size,
      uploadedAt: new Date().toISOString(),
      linkedTrackId,
      content: input.content,
    }
    scopedMusic.uploadedLyrics.unshift(uploadedLyrics)
    saveStore(store)
    return res.status(201).json({
      ok: true,
      uploadedLyricsId: uploadedLyrics.id,
      music: buildPublicMusicState(scopedMusic),
    })
  } catch (error) {
    logError('music:upload-lyrics', error, getRequestId(req))
    return sendError(req, res, 400, 'invalid_request', error instanceof Error ? error.message : '上传歌词失败')
  }
})

app.put('/api/music/tracks/:trackId', (req, res) => {
  try {
    const store = loadStore()
    const { music: scopedMusic } = getOrCreateDeviceMusicState(store, resolveRequestDeviceId(req))
    const trackId = String(req.params.trackId || '').trim()
    const name = String(req.body?.name || '').trim()
    if (!trackId || !name) {
      return sendError(req, res, 400, 'invalid_request', 'trackId/name 必填')
    }
    scopedMusic.playlist = Array.isArray(scopedMusic.playlist) ? scopedMusic.playlist : []
    scopedMusic.uploadedSongs = Array.isArray(scopedMusic.uploadedSongs) ? scopedMusic.uploadedSongs : []
    const track = scopedMusic.playlist.find((item) => item.id === trackId)
    if (!track) {
      return sendError(req, res, 404, 'not_found', '歌曲不存在')
    }
    track.name = name
    const song = scopedMusic.uploadedSongs.find((item) => item.trackId === trackId)
    if (song) {
      song.fileName = name
    }
    saveStore(store)
    return res.json({ ok: true, music: buildPublicMusicState(scopedMusic) })
  } catch (error) {
    logError('music:rename-track', error, getRequestId(req))
    return sendError(req, res, 400, 'invalid_request', error instanceof Error ? error.message : '改歌名失败')
  }
})

app.delete('/api/music/tracks/:trackId', (req, res) => {
  try {
    const store = loadStore()
    const { music: scopedMusic } = getOrCreateDeviceMusicState(store, resolveRequestDeviceId(req))
    const trackId = String(req.params.trackId || '').trim()
    const playlist = Array.isArray(scopedMusic.playlist) ? scopedMusic.playlist : []
    const nextPlaylist = playlist.filter((item) => item.id !== req.params.trackId)
    scopedMusic.playlist = nextPlaylist
    scopedMusic.uploadedSongs = Array.isArray(scopedMusic.uploadedSongs)
      ? scopedMusic.uploadedSongs.filter((item) => item.trackId !== trackId)
      : []
    scopedMusic.uploadedLyrics = Array.isArray(scopedMusic.uploadedLyrics)
      ? scopedMusic.uploadedLyrics.filter((item) => item.linkedTrackId !== trackId)
      : []
    scopedMusic.recentPlayed = Array.isArray(scopedMusic.recentPlayed)
      ? scopedMusic.recentPlayed.filter((item) => item.trackId !== trackId)
      : []
    if (scopedMusic.nowPlayingTrackId === trackId) {
      scopedMusic.nowPlayingTrackId = nextPlaylist[0]?.id || ''
      if (scopedMusic.nowPlayingTrackId) {
        recordRecentPlay(scopedMusic, scopedMusic.nowPlayingTrackId)
      }
    }
    saveStore(store)
    return res.json({ ok: true, music: buildPublicMusicState(scopedMusic) })
  } catch (error) {
    logError('music:remove-track', error, getRequestId(req))
    return sendError(req, res, 400, 'invalid_request', error instanceof Error ? error.message : '删除歌曲失败')
  }
})

app.put('/api/music/now-playing', (req, res) => {
  try {
    const store = loadStore()
    const { music: scopedMusic } = getOrCreateDeviceMusicState(store, resolveRequestDeviceId(req))
    const trackId = String(req.body?.trackId || '').trim()
    const playlist = Array.isArray(scopedMusic.playlist) ? scopedMusic.playlist : []
    if (trackId && !playlist.find((item) => item.id === trackId)) {
      return sendError(req, res, 400, 'invalid_request', '歌曲不存在')
    }
    scopedMusic.nowPlayingTrackId = trackId
    recordRecentPlay(scopedMusic, trackId)
    saveStore(store)
    return res.json({ ok: true, music: buildPublicMusicState(scopedMusic) })
  } catch (error) {
    logError('music:set-now-playing', error, getRequestId(req))
    return sendError(req, res, 400, 'invalid_request', error instanceof Error ? error.message : '更新播放状态失败')
  }
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
