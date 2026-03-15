import { useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import {
  bindRoleWorldBook,
  bindSessionWorldBook,
  createWorldBook,
  createRole,
  exportData,
  fetchChatSettings,
  fetchConfig,
  fetchUserPersona,
  fetchRoles,
  fetchWorldBooks,
  saveChatSettings,
  saveConfig,
  saveUserPersona,
  sendRoleMessage,
} from '../../api/unifiedClient'
import { PixelButton, PixelInput } from '../../components/ui'
import type {
  AIConfigInput,
  ChatMessage,
  ChatUiSettings,
  HideAvatarMode,
  MemorySnapshot,
  ReadReceiptStyle,
  RoleProfile,
  TimestampStyle,
  UserPersonaMemory,
  WorldBook,
} from '../../api/types'
import { UnifiedApiError } from '../../api/types'
import { webPlatformBridge } from '../../platform/platformBridge'
import { setButtonBipEnabled } from '../../platform/soundEffects'
import type { AppRuntimeProps } from '../../simulator/types'
import { resolveUiFeatureFlags, saveUiFeatureFlags } from '../../theme/featureFlags'
import type { UiFeatureFlagKey, UiFeatureFlags } from '../../theme/featureFlags'
import { applyThemeMode } from '../../theme/themeMode'

export type TabKey = 'roles' | 'chat' | 'worldbook' | 'editor' | 'settings' | 'chat-style'
type ChatViewMode = 'list' | 'detail'

type SessionState = {
  messages: ChatMessage[]
  memory: MemorySnapshot
  sessionWorldBookId: string
}

type MessageActionMenuState = {
  index: number
  message: ChatMessage
  x: number
  y: number
}

type LocalThemeSettings = {
  fontFamily: string
  wallpaperDataUrl: string
  avatarFrameColor: string
  avatarFrameSize: number
  avatarPendant: string
  nightMode: boolean
}

type CallOverlayState = {
  mode: 'voice' | 'video'
  status: 'ringing' | 'connected'
}

type PersonaTemplate = {
  id: string
  name: string
  readableMemory: string
  privateMemory: string
  allowPrivateForAI: boolean
}

type RoleDraftInput = {
  name: string
  avatar: string
  description: string
  worldBookId?: string
  personaIdentity?: string
  personaSpeakingStyle?: string
}

type ApiPreset = {
  id: string
  name: string
  apiUrl: string
  modelName: string
  memoryCount: number
  temperature: number
  timeAware: boolean
  apiKey?: string
}

type ApiUiSettings = {
  apiUrl: string
  apiKey: string
  modelName: string
  memoryCount: number
  temperature: number
  timeAware: boolean
  presets: ApiPreset[]
  fetchedModels: string[]
}

function getSessionId(roleId: string) {
  return `session-${roleId}`
}

function defaultSessionState(): SessionState {
  return {
    messages: [],
    memory: { summary: '', facts: [] },
    sessionWorldBookId: '',
  }
}

function getSessionLastTimestamp(session?: SessionState) {
  const last = session?.messages.at(-1)
  if (!last) return 0
  return new Date(last.timestamp).getTime()
}

function defaultChatSettings(): ChatUiSettings {
  return {
    showTimestamp: true,
    showSeconds: false,
    timestampStyle: 'bubble',
    showReadReceipt: true,
    readReceiptStyle: 'bubble',
    hideAvatarMode: 'none',
    myBubbleColor: '#4c1d95',
    friendBubbleColor: '#312e81',
    buttonBipEnabled: true,
  }
}

function defaultUserPersona(): UserPersonaMemory {
  return {
    readableMemory: '',
    privateMemory: '',
    allowPrivateForAI: false,
  }
}

function defaultLocalThemeSettings(): LocalThemeSettings {
  return {
    fontFamily: 'system-ui, "PingFang SC", "Microsoft YaHei", sans-serif',
    wallpaperDataUrl: '',
    avatarFrameColor: '#facc15',
    avatarFrameSize: 2,
    avatarPendant: '💫',
    nightMode: false,
  }
}

function formatMessageTime(iso: string, showSeconds: boolean) {
  const date = new Date(iso)
  return date.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: showSeconds ? '2-digit' : undefined,
    hour12: false,
  })
}

function shouldHideAvatar(mode: HideAvatarMode, role: 'user' | 'assistant') {
  if (mode === 'both') return true
  if (mode === 'me') return role === 'user'
  if (mode === 'friend') return role === 'assistant'
  return false
}

function formatPersonaTemplateName() {
  const now = new Date()
  const pad = (value: number) => String(value).padStart(2, '0')
  const date = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  return `人设-${date}-${time}`
}

function buildRoleDraftPayload(input: RoleDraftInput) {
  return {
    name: input.name,
    avatar: input.avatar,
    description: input.description,
    worldBookId: input.worldBookId || '',
    persona: {
      identity: input.personaIdentity || '',
      relationship: '',
      speakingStyle: input.personaSpeakingStyle || '',
      values: '',
      boundaries: '',
      worldview: '',
      sampleDialogues: [{ user: '', assistant: '' }],
    },
  }
}

function defaultApiUiSettings(): ApiUiSettings {
  return {
    apiUrl: '',
    apiKey: '',
    modelName: '',
    memoryCount: 18,
    temperature: 0.8,
    timeAware: true,
    presets: [],
    fetchedModels: [],
  }
}

type ChatAppProps = AppRuntimeProps & {
  defaultTab?: TabKey
  hideTabBar?: boolean
  appTitle?: string
  enableSettingsSubTabs?: boolean
}

const MAIN_TAB_DEFAULT_ORDER: TabKey[] = ['roles', 'chat', 'worldbook', 'editor', 'settings', 'chat-style']
const SETTINGS_SUB_TAB_ORDER: TabKey[] = ['settings', 'chat-style']
const TAB_LABELS: Record<TabKey, string> = {
  roles: '通讯录',
  chat: '聊天',
  worldbook: '世界书',
  editor: '人设',
  settings: '设置',
  'chat-style': '聊天设置',
}

export function ChatApp({
  onExit,
  defaultTab = 'chat',
  hideTabBar = false,
  appTitle,
  enableSettingsSubTabs = false,
}: ChatAppProps) {
  const [tab, setTab] = useState<TabKey>(defaultTab)
  const [mainTabOrder, setMainTabOrder] = useState<TabKey[]>(MAIN_TAB_DEFAULT_ORDER)
  const [draggingMainTab, setDraggingMainTab] = useState<TabKey | null>(null)
  const [chatViewMode, setChatViewMode] = useState<ChatViewMode>('list')
  const [roles, setRoles] = useState<RoleProfile[]>([])
  const [worldBooks, setWorldBooks] = useState<WorldBook[]>([])
  const [selectedRoleId, setSelectedRoleId] = useState('')
  const [config, setConfig] = useState<AIConfigInput>({
    baseUrl: '',
    model: '',
    apiKey: '',
    headers: {},
  })
  const [apiUi, setApiUi] = useState<ApiUiSettings>(defaultApiUiSettings())
  const [headersText, setHeadersText] = useState('{}')
  const [maskedKey, setMaskedKey] = useState('')
  const [isBooting, setIsBooting] = useState(true)
  const [text, setText] = useState('')
  const [isSavingConfig, setIsSavingConfig] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [isSavingChatSettings, setIsSavingChatSettings] = useState(false)
  const [uiFlags, setUiFlags] = useState<UiFeatureFlags>(() => resolveUiFeatureFlags())
  const [showPlusPanel, setShowPlusPanel] = useState(false)
  const [sessionMap, setSessionMap] = useState<Record<string, SessionState>>({})
  const [pinnedRoleIds, setPinnedRoleIds] = useState<Record<string, boolean>>({})
  const [unreadMap, setUnreadMap] = useState<Record<string, number>>({})
  const [blockedRoleIds, setBlockedRoleIds] = useState<Record<string, boolean>>({})
  const [memorySyncRoleIds, setMemorySyncRoleIds] = useState<Record<string, boolean>>({})
  const [messageActionMenu, setMessageActionMenu] = useState<MessageActionMenuState | null>(null)
  const [callOverlay, setCallOverlay] = useState<CallOverlayState | null>(null)
  const [localTheme, setLocalTheme] = useState<LocalThemeSettings>(defaultLocalThemeSettings())
  const [showRoleQuickMenu, setShowRoleQuickMenu] = useState(false)
  const [showAddFriendForm, setShowAddFriendForm] = useState(false)
  const [showCreateGroupForm, setShowCreateGroupForm] = useState(false)
  const [newFriendName, setNewFriendName] = useState('')
  const [newFriendDescription, setNewFriendDescription] = useState('')
  const [newFriendCharPersona, setNewFriendCharPersona] = useState('')
  const [newFriendWorldBookId, setNewFriendWorldBookId] = useState('')
  const [newGroupName, setNewGroupName] = useState('')
  const [newGroupMemberIds, setNewGroupMemberIds] = useState<string[]>([])
  const [newWorldBookName, setNewWorldBookName] = useState('')
  const [newWorldBookContent, setNewWorldBookContent] = useState('')
  const [selectedWorldBookIdForRole, setSelectedWorldBookIdForRole] = useState('')
  const [chatSettings, setChatSettings] = useState<ChatUiSettings>(defaultChatSettings())
  const [userPersona, setUserPersona] = useState<UserPersonaMemory>(defaultUserPersona())
  const [isPersonaShelfOpen, setIsPersonaShelfOpen] = useState(false)
  const [personaTemplateName, setPersonaTemplateName] = useState('')
  const [personaTemplates, setPersonaTemplates] = useState<PersonaTemplate[]>([])
  const [highlightedPersonaTemplateId, setHighlightedPersonaTemplateId] = useState<string | null>(null)
  const [isSavingUserPersona, setIsSavingUserPersona] = useState(false)
  const [errorText, setErrorText] = useState('')
  const [successText, setSuccessText] = useState('')
  const longPressTimerRef = useRef<number | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const personaImportInputRef = useRef<HTMLInputElement | null>(null)
  const personaHighlightTimerRef = useRef<number | null>(null)

  function updateUiFlag(key: UiFeatureFlagKey, enabled: boolean) {
    setUiFlags((prev) => {
      const next = { ...prev, [key]: enabled }
      saveUiFeatureFlags(next)
      return next
    })
  }

  const selectedRole = useMemo(
    () => roles.find((item) => item.id === selectedRoleId) ?? null,
    [roles, selectedRoleId],
  )
  const sortedRoles = useMemo(() => {
    const cloned = [...roles]
    cloned.sort((a, b) => {
      const pinnedDelta = Number(Boolean(pinnedRoleIds[b.id])) - Number(Boolean(pinnedRoleIds[a.id]))
      if (pinnedDelta !== 0) return pinnedDelta

      const timeDelta =
        getSessionLastTimestamp(sessionMap[getSessionId(b.id)]) -
        getSessionLastTimestamp(sessionMap[getSessionId(a.id)])
      if (timeDelta !== 0) return timeDelta
      return a.name.localeCompare(b.name, 'zh-CN')
    })
    return cloned
  }, [roles, pinnedRoleIds, sessionMap])

  const activeSessionId = selectedRoleId ? getSessionId(selectedRoleId) : ''
  const activeSession = activeSessionId ? sessionMap[activeSessionId] ?? defaultSessionState() : defaultSessionState()

  const roleWorldBook = useMemo(
    () => worldBooks.find((item) => item.id === (selectedRole?.worldBookId || '')) ?? null,
    [worldBooks, selectedRole],
  )
  const sessionWorldBook = useMemo(
    () => worldBooks.find((item) => item.id === activeSession.sessionWorldBookId) ?? null,
    [worldBooks, activeSession.sessionWorldBookId],
  )
  const isSelectedRoleBlocked = selectedRoleId ? Boolean(blockedRoleIds[selectedRoleId]) : false
  const isMemorySyncEnabled = selectedRoleId ? Boolean(memorySyncRoleIds[selectedRoleId]) : false

  async function bootstrap() {
    setIsBooting(true)
    setErrorText('')
    try {
      const [roleList, remoteConfig, worldBookList, remoteChatSettings, remoteUserPersona] =
        await Promise.all([
        fetchRoles(),
        fetchConfig(),
        fetchWorldBooks(),
        fetchChatSettings(),
          fetchUserPersona(),
        ])
      setRoles(roleList)
      setWorldBooks(worldBookList)
      const firstRoleId = roleList[0]?.id ?? ''
      setSelectedRoleId(firstRoleId)
      setConfig((prev) => ({
        ...prev,
        baseUrl: remoteConfig.baseUrl || '',
        model: remoteConfig.model || '',
        headers: remoteConfig.headers || {},
      }))
      setApiUi((prev) => ({
        ...prev,
        apiUrl: remoteConfig.baseUrl || '',
        modelName: remoteConfig.model || '',
      }))
      setHeadersText(JSON.stringify(remoteConfig.headers || {}, null, 2))
      setMaskedKey(remoteConfig.maskedApiKey || '')
      const mergedChatSettings = { ...defaultChatSettings(), ...remoteChatSettings }
      setChatSettings(mergedChatSettings)
      setButtonBipEnabled(mergedChatSettings.buttonBipEnabled)
      setUserPersona({ ...defaultUserPersona(), ...remoteUserPersona })
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : '初始化失败')
    } finally {
      setIsBooting(false)
    }
  }

  useEffect(() => {
    void bootstrap()
  }, [])

  useEffect(() => {
    setTab(defaultTab)
  }, [defaultTab])

  useEffect(() => {
    setMessageActionMenu(null)
    setCallOverlay(null)
    if (longPressTimerRef.current) {
      window.clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
  }, [activeSessionId])

  useEffect(() => {
    setSelectedWorldBookIdForRole(selectedRole?.worldBookId || '')
  }, [selectedRole?.id, selectedRole?.worldBookId])

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem('pixel-chat-local-theme')
      if (!raw) return
      const parsed = JSON.parse(raw) as Partial<LocalThemeSettings>
      setLocalTheme((prev) => ({
        ...prev,
        ...parsed,
        avatarFrameSize: Math.max(0, Number(parsed.avatarFrameSize ?? prev.avatarFrameSize)),
      }))
    } catch {
      // 忽略损坏的本地主题配置，使用默认值
    }
  }, [])

  useEffect(() => {
    window.localStorage.setItem('pixel-chat-local-theme', JSON.stringify(localTheme))
  }, [localTheme])

  useEffect(() => {
    applyThemeMode(localTheme.nightMode ? 'night' : 'light')
  }, [localTheme.nightMode])

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem('pixel-api-ui-settings')
      if (!raw) return
      const parsed = JSON.parse(raw) as Partial<ApiUiSettings>
      setApiUi((prev) => ({
        ...prev,
        ...parsed,
        apiUrl: parsed.apiUrl ?? prev.apiUrl,
        apiKey: parsed.apiKey ?? prev.apiKey,
        modelName: parsed.modelName ?? prev.modelName,
        memoryCount: Number(parsed.memoryCount ?? prev.memoryCount) || prev.memoryCount,
        temperature: Number(parsed.temperature ?? prev.temperature) || prev.temperature,
        timeAware: parsed.timeAware ?? prev.timeAware,
        presets: Array.isArray(parsed.presets) ? parsed.presets : prev.presets,
        fetchedModels: Array.isArray(parsed.fetchedModels) ? parsed.fetchedModels : prev.fetchedModels,
      }))
    } catch {
      // 忽略损坏的 API 设置缓存
    }
  }, [])

  useEffect(() => {
    window.localStorage.setItem('pixel-api-ui-settings', JSON.stringify(apiUi))
  }, [apiUi])

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem('pixel-user-persona-templates')
      if (!raw) return
      const parsed = JSON.parse(raw) as PersonaTemplate[]
      if (Array.isArray(parsed)) {
        setPersonaTemplates(parsed)
      }
    } catch {
      // 忽略损坏的人设模板缓存
    }
  }, [])

  useEffect(() => {
    window.localStorage.setItem('pixel-user-persona-templates', JSON.stringify(personaTemplates))
  }, [personaTemplates])

  useEffect(() => {
    if (!highlightedPersonaTemplateId) return
    if (personaHighlightTimerRef.current) {
      window.clearTimeout(personaHighlightTimerRef.current)
    }
    personaHighlightTimerRef.current = window.setTimeout(() => {
      setHighlightedPersonaTemplateId(null)
      personaHighlightTimerRef.current = null
    }, 2200)
    return () => {
      if (personaHighlightTimerRef.current) {
        window.clearTimeout(personaHighlightTimerRef.current)
        personaHighlightTimerRef.current = null
      }
    }
  }, [highlightedPersonaTemplateId])

  useEffect(() => {
    const onGlobalPointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target
      if (!(target instanceof Element)) return
      if (target.closest('.message-action-menu')) return
      if (!target.closest('.role-quick-menu') && !target.closest('.role-plus-trigger')) {
        setShowRoleQuickMenu(false)
      }
      setMessageActionMenu(null)
    }
    document.addEventListener('mousedown', onGlobalPointerDown)
    document.addEventListener('touchstart', onGlobalPointerDown, { passive: true })
    return () => {
      document.removeEventListener('mousedown', onGlobalPointerDown)
      document.removeEventListener('touchstart', onGlobalPointerDown)
      clearLongPressTimer()
    }
  }, [])

  function openConversation(role: RoleProfile) {
    setSelectedRoleId(role.id)
    setUnreadMap((prev) => ({ ...prev, [role.id]: 0 }))
    setTab('chat')
    setChatViewMode('detail')
    setShowPlusPanel(false)
    setSuccessText('')
  }

  function reorderTabOrder(order: TabKey[], dragging: TabKey, target: TabKey) {
    if (dragging === target) return order
    const withoutDragging = order.filter((item) => item !== dragging)
    const targetIndex = withoutDragging.indexOf(target)
    if (targetIndex < 0) return order
    withoutDragging.splice(targetIndex, 0, dragging)
    return withoutDragging
  }

  async function handleSend(content: string) {
    const cleaned = content.trim()
    if (!cleaned || isSending || !selectedRoleId || !activeSessionId) {
      return
    }
    if (blockedRoleIds[selectedRoleId]) {
      setErrorText('你已将对方加入黑名单，无法发送消息')
      return
    }

    const optimisticMessages: ChatMessage[] = [
      ...activeSession.messages,
      { role: 'user', content: cleaned, timestamp: new Date().toISOString() },
    ]
    setSessionMap((prev) => ({
      ...prev,
      [activeSessionId]: {
        ...(prev[activeSessionId] ?? defaultSessionState()),
        messages: optimisticMessages,
      },
    }))
    setText('')
    setErrorText('')
    setSuccessText('')
    setIsSending(true)
    webPlatformBridge.vibrate(10)

    try {
      const result = await sendRoleMessage({
        roleId: selectedRoleId,
        sessionId: activeSessionId,
        message: cleaned,
      })
      setSessionMap((prev) => ({
        ...prev,
        [activeSessionId]: {
          messages: result.conversation,
          memory: result.memory,
          sessionWorldBookId: result.sessionWorldBookId || prev[activeSessionId]?.sessionWorldBookId || '',
        },
      }))
    } catch (error) {
      if (error instanceof UnifiedApiError) {
        setErrorText(`${error.code}: ${error.message}`)
      } else {
        setErrorText(error instanceof Error ? error.message : '请求失败')
      }
    } finally {
      setIsSending(false)
    }
  }

  function clearLongPressTimer() {
    if (longPressTimerRef.current) {
      window.clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
  }

  function openMessageActionMenu(index: number, message: ChatMessage, clientX: number, clientY: number) {
    setMessageActionMenu({ index, message, x: clientX, y: clientY })
  }

  function scheduleLongPressMenu(index: number, message: ChatMessage, clientX: number, clientY: number) {
    clearLongPressTimer()
    longPressTimerRef.current = window.setTimeout(() => {
      openMessageActionMenu(index, message, clientX, clientY)
      longPressTimerRef.current = null
    }, 450)
  }

  function removeMessageByIndex(index: number) {
    if (!activeSessionId || index < 0) return
    setSessionMap((prev) => {
      const source = prev[activeSessionId] ?? defaultSessionState()
      if (index >= source.messages.length) return prev
      const nextMessages = source.messages.filter((_, messageIndex) => messageIndex !== index)
      return {
        ...prev,
        [activeSessionId]: {
          ...source,
          messages: nextMessages,
        },
      }
    })
  }

  async function handleCopyMessage(content: string) {
    try {
      await navigator.clipboard.writeText(content)
      setSuccessText('已复制消息')
    } catch {
      setErrorText('复制失败，请检查浏览器剪贴板权限')
    } finally {
      setMessageActionMenu(null)
    }
  }

  function handleDeleteMessage(index: number) {
    removeMessageByIndex(index)
    setSuccessText('已删除消息')
    setMessageActionMenu(null)
  }

  function handleRecallMessage(index: number, message: ChatMessage) {
    if (message.role !== 'user') {
      setErrorText('只能撤回我的消息')
      setMessageActionMenu(null)
      return
    }
    removeMessageByIndex(index)
    setSuccessText('撤回成功')
    setMessageActionMenu(null)
  }

  function markCurrentConversationUnread() {
    if (!selectedRoleId) return
    setUnreadMap((prev) => ({ ...prev, [selectedRoleId]: (prev[selectedRoleId] ?? 0) + 1 }))
    setSuccessText('已标记未读')
  }

  function togglePinSelectedConversation() {
    if (!selectedRoleId) return
    setPinnedRoleIds((prev) => ({ ...prev, [selectedRoleId]: !prev[selectedRoleId] }))
  }

  function recallLastUserMessage() {
    if (!activeSessionId) return
    const source = sessionMap[activeSessionId] ?? defaultSessionState()
    const nextMessages = [...source.messages]
    for (let i = nextMessages.length - 1; i >= 0; i -= 1) {
      if (nextMessages[i]?.role === 'user') {
        nextMessages.splice(i, 1)
        setSessionMap((prev) => ({
          ...prev,
          [activeSessionId]: {
            ...(prev[activeSessionId] ?? defaultSessionState()),
            messages: nextMessages,
          },
        }))
        setSuccessText('已撤回我最近一条消息')
        return
      }
    }
    setErrorText('没有可撤回的我的消息')
  }

  function clearActiveConversation() {
    if (!activeSessionId || !selectedRoleId) return
    setSessionMap((prev) => ({ ...prev, [activeSessionId]: defaultSessionState() }))
    setUnreadMap((prev) => ({ ...prev, [selectedRoleId]: 0 }))
    setSuccessText('已清空当前聊天记录')
  }

  function toggleBlockSelectedRole() {
    if (!selectedRoleId) return
    const next = !blockedRoleIds[selectedRoleId]
    setBlockedRoleIds((prev) => ({ ...prev, [selectedRoleId]: next }))
    setSuccessText(next ? '已加入黑名单' : '已移出黑名单')
  }

  function toggleMemorySyncSelectedRole() {
    if (!selectedRoleId) return
    const next = !memorySyncRoleIds[selectedRoleId]
    setMemorySyncRoleIds((prev) => ({ ...prev, [selectedRoleId]: next }))
    setSuccessText(next ? '已开启记忆互通' : '已关闭记忆互通')
  }

  function startCall(mode: 'voice' | 'video') {
    if (!selectedRoleId) return
    setCallOverlay({ mode, status: 'ringing' })
  }

  function acceptCall() {
    setCallOverlay((prev) => {
      if (!prev) return prev
      return { ...prev, status: 'connected' }
    })
  }

  function hangupCall() {
    setCallOverlay(null)
  }

  function handleWallpaperUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      setLocalTheme((prev) => ({ ...prev, wallpaperDataUrl: String(reader.result || '') }))
    }
    reader.readAsDataURL(file)
    event.target.value = ''
  }

  async function handleBindSessionWorldBook(worldBookId: string) {
    if (!selectedRoleId || !activeSessionId) return
    try {
      await bindSessionWorldBook(activeSessionId, selectedRoleId, worldBookId)
      setSessionMap((prev) => ({
        ...prev,
        [activeSessionId]: {
          ...(prev[activeSessionId] ?? defaultSessionState()),
          sessionWorldBookId: worldBookId,
        },
      }))
      setSuccessText('会话世界书已绑定')
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : '会话绑定失败')
    }
  }

  async function handleCreateWorldBook() {
    const name = newWorldBookName.trim()
    const content = newWorldBookContent.trim()
    if (!name) {
      setErrorText('请输入世界书名称')
      return
    }
    try {
      const created = await createWorldBook({ name, content })
      const list = await fetchWorldBooks()
      setWorldBooks(list)
      setSelectedWorldBookIdForRole(created.id)
      setNewWorldBookName('')
      setNewWorldBookContent('')
      setSuccessText(`已创建世界书：${created.name}`)
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : '创建世界书失败')
    }
  }

  async function handleBindRoleWorldBook(worldBookId: string) {
    if (!selectedRoleId) {
      setErrorText('请先选择一个联系人')
      return
    }
    try {
      await bindRoleWorldBook(selectedRoleId, worldBookId)
      const roleList = await fetchRoles()
      setRoles(roleList)
      setSelectedWorldBookIdForRole(worldBookId)
      setSuccessText(worldBookId ? '已绑定到当前联系人' : '已解除联系人世界书绑定')
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : '绑定联系人世界书失败')
    }
  }

  async function handleSaveConfig() {
    setIsSavingConfig(true)
    setErrorText('')
    setSuccessText('')
    try {
      const parsedHeaders = JSON.parse(headersText || '{}') as Record<string, string>
      const modelName = apiUi.modelName.trim()
      const apiUrl = apiUi.apiUrl.trim()
      if (!apiUrl || !modelName) {
        setErrorText('请填写 API 地址和模型名称')
        return
      }
      const result = await saveConfig({
        ...config,
        baseUrl: apiUrl,
        model: modelName,
        apiKey: apiUi.apiKey.trim(),
        headers: parsedHeaders,
      })
      setMaskedKey(result.maskedApiKey)
      setConfig((prev) => ({
        ...prev,
        baseUrl: apiUrl,
        model: modelName,
        headers: parsedHeaders,
        apiKey: '',
      }))
      setApiUi((prev) => ({ ...prev, apiKey: '' }))
      setSuccessText('API 设置已保存')
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : '保存配置失败')
    } finally {
      setIsSavingConfig(false)
    }
  }

  function saveCurrentApiPreset() {
    const name = window.prompt('请输入预设名称')
    if (!name) return
    const trimmed = name.trim()
    if (!trimmed) return
    setApiUi((prev) => ({
      ...prev,
      presets: [
        ...prev.presets.filter((item) => item.name !== trimmed),
        {
          id: `api-preset-${Date.now()}`,
          name: trimmed,
          apiUrl: prev.apiUrl,
          modelName: prev.modelName,
          memoryCount: prev.memoryCount,
          temperature: prev.temperature,
          timeAware: prev.timeAware,
          apiKey: prev.apiKey || undefined,
        },
      ],
    }))
    setSuccessText(`已保存预设：${trimmed}`)
  }

  function openApiPresetSelector() {
    if (apiUi.presets.length === 0) {
      setErrorText('暂无 API 预设，请先保存')
      return
    }
    const lines = apiUi.presets.map((item, index) => `${index + 1}. ${item.name}`)
    const input = window.prompt(`请输入预设序号：\n${lines.join('\n')}`)
    if (!input) return
    const index = Number(input) - 1
    const selected = apiUi.presets[index]
    if (!selected) {
      setErrorText('预设序号无效')
      return
    }
    setApiUi((prev) => ({
      ...prev,
      apiUrl: selected.apiUrl,
      modelName: selected.modelName,
      memoryCount: selected.memoryCount,
      temperature: selected.temperature,
      timeAware: selected.timeAware,
      apiKey: selected.apiKey ?? prev.apiKey,
    }))
    setSuccessText(`已应用预设：${selected.name}`)
  }

  async function fetchModelList() {
    setErrorText('')
    setSuccessText('')
    const apiUrl = apiUi.apiUrl.trim().replace(/\/+$/, '')
    const apiKey = apiUi.apiKey.trim()
    if (!apiUrl || !apiKey) {
      setErrorText('请先填写 API 地址和 API Key')
      return
    }
    const candidates = /\/models$/i.test(apiUrl)
      ? [apiUrl]
      : /\/v\d+$/i.test(apiUrl)
        ? [`${apiUrl}/models`]
        : [`${apiUrl}/models`, `${apiUrl}/v1/models`]
    let fetchedModels: string[] = []
    let lastMessage = '请求失败'
    for (const endpoint of candidates) {
      try {
        const response = await fetch(endpoint, {
          method: 'GET',
          headers: { Authorization: `Bearer ${apiKey}` },
        })
        if (!response.ok) {
          lastMessage = `HTTP ${response.status}`
          continue
        }
        const payload = (await response.json()) as {
          data?: Array<{ id?: string; model?: string; name?: string } | string>
          models?: Array<{ id?: string; model?: string; name?: string } | string>
        }
        const source = Array.isArray(payload.data)
          ? payload.data
          : Array.isArray(payload.models)
            ? payload.models
            : []
        fetchedModels = source
          .map((item) => {
            if (typeof item === 'string') return item
            return item.id || item.model || item.name || ''
          })
          .filter(Boolean)
      } catch (error) {
        lastMessage = error instanceof Error ? error.message : '请求异常'
      }
      if (fetchedModels.length > 0) break
    }
    if (fetchedModels.length === 0) {
      setErrorText(`拉取模型失败：${lastMessage}`)
      return
    }
    const unique = Array.from(new Set(fetchedModels))
    setApiUi((prev) => ({
      ...prev,
      fetchedModels: unique,
      modelName: unique.includes(prev.modelName) ? prev.modelName : unique[0],
    }))
    setSuccessText(`模型列表拉取成功，共 ${unique.length} 个`)
  }

  async function handleExportData() {
    try {
      const payload = await exportData()
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `roleplay-export-${Date.now()}.json`
      a.click()
      URL.revokeObjectURL(url)
      setSuccessText('数据已导出')
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : '导出失败')
    }
  }

  async function handleSaveChatSettings() {
    setIsSavingChatSettings(true)
    setErrorText('')
    setSuccessText('')
    try {
      const result = await saveChatSettings(chatSettings)
      setChatSettings(result.chatUiSettings)
      setButtonBipEnabled(result.chatUiSettings.buttonBipEnabled)
      setSuccessText('聊天设置已保存')
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : '保存聊天设置失败')
    } finally {
      setIsSavingChatSettings(false)
    }
  }

  async function handleSaveUserPersona() {
    setIsSavingUserPersona(true)
    setErrorText('')
    setSuccessText('')
    try {
      const result = await saveUserPersona(userPersona)
      setUserPersona(result.userPersona)
      const templateName = personaTemplateName.trim() || formatPersonaTemplateName()
      const newTemplate: PersonaTemplate = {
        id: `persona-${Date.now()}`,
        name: templateName,
        readableMemory: result.userPersona.readableMemory,
        privateMemory: result.userPersona.privateMemory,
        allowPrivateForAI: result.userPersona.allowPrivateForAI,
      }
      setPersonaTemplates((prev) => [newTemplate, ...prev.filter((item) => item.name !== templateName)])
      setIsPersonaShelfOpen(true)
      setHighlightedPersonaTemplateId(newTemplate.id)
      setPersonaTemplateName('')
      setSuccessText(`用户人设记忆已保存，并收纳到更多人设：${templateName}`)
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : '保存用户人设记忆失败')
    } finally {
      setIsSavingUserPersona(false)
    }
  }

  function saveCurrentPersonaAsTemplate() {
    const name = personaTemplateName.trim()
    if (!name) {
      setErrorText('请先输入人设名称')
      return
    }
    const newTemplate: PersonaTemplate = {
      id: `persona-${Date.now()}`,
      name,
      readableMemory: userPersona.readableMemory,
      privateMemory: userPersona.privateMemory,
      allowPrivateForAI: userPersona.allowPrivateForAI,
    }
    setPersonaTemplates((prev) => [newTemplate, ...prev.filter((item) => item.name !== name)])
    setIsPersonaShelfOpen(true)
    setHighlightedPersonaTemplateId(newTemplate.id)
    setPersonaTemplateName('')
    setSuccessText(`已保存人设：${name}`)
  }

  function applyPersonaTemplate(template: PersonaTemplate) {
    setUserPersona({
      readableMemory: template.readableMemory,
      privateMemory: template.privateMemory,
      allowPrivateForAI: template.allowPrivateForAI,
    })
    setSuccessText(`已加载人设：${template.name}`)
  }

  function deletePersonaTemplate(templateId: string) {
    setPersonaTemplates((prev) => prev.filter((item) => item.id !== templateId))
    setSuccessText('已删除人设模板')
  }

  async function handleAddFriend() {
    const name = newFriendName.trim()
    const charPersona = newFriendCharPersona.trim()
    if (!name) {
      setErrorText('请输入好友昵称')
      return
    }
    if (!charPersona) {
      setErrorText('请先填写 {{CHAR}} 人设')
      return
    }
    try {
      const payload = buildRoleDraftPayload({
        name,
        avatar: name.slice(0, 1) || '友',
        description: newFriendDescription.trim() || '通过 QQ 添加的新好友',
        worldBookId: newFriendWorldBookId,
        personaIdentity: charPersona,
      })
      await createRole(payload)
      const roleList = await fetchRoles()
      setRoles(roleList)
      const created = roleList.find((item) => item.name === name)
      if (created) {
        setSelectedRoleId(created.id)
      }
      setNewFriendName('')
      setNewFriendDescription('')
      setNewFriendCharPersona('')
      setNewFriendWorldBookId('')
      setShowAddFriendForm(false)
      setShowRoleQuickMenu(false)
      setSuccessText(`已添加好友：${name}`)
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : '添加好友失败')
    }
  }

  async function handleCreateGroup() {
    const groupName = newGroupName.trim()
    if (!groupName) {
      setErrorText('请输入群聊名称')
      return
    }
    try {
      const memberNames = roles
        .filter((role) => newGroupMemberIds.includes(role.id))
        .map((role) => role.name)
      const payload = buildRoleDraftPayload({
        name: groupName,
        avatar: '群',
        description: memberNames.length
          ? `群成员：${memberNames.join('、')}`
          : 'QQ 群聊（暂无成员）',
      })
      await createRole(payload)
      const roleList = await fetchRoles()
      setRoles(roleList)
      const created = roleList.find((item) => item.name === groupName)
      if (created) {
        setSelectedRoleId(created.id)
      }
      setNewGroupName('')
      setNewGroupMemberIds([])
      setShowCreateGroupForm(false)
      setShowRoleQuickMenu(false)
      setSuccessText(`已创建群聊：${groupName}`)
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : '创建群聊失败')
    }
  }

  function exportPersonaTemplates() {
    try {
      const payload = {
        exportedAt: new Date().toISOString(),
        templates: personaTemplates,
      }
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `persona-templates-${Date.now()}.json`
      a.click()
      URL.revokeObjectURL(url)
      setSuccessText('已导出人设模板')
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : '导出人设模板失败')
    }
  }

  function importPersonaTemplates(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result || '')) as
          | { templates?: PersonaTemplate[] }
          | PersonaTemplate[]
        const source = Array.isArray(parsed) ? parsed : parsed.templates
        if (!Array.isArray(source)) {
          setErrorText('导入失败：JSON 中未找到 templates 数组')
          return
        }
        const normalized = source
          .filter((item) => item && typeof item.name === 'string')
          .map((item) => ({
            id: item.id || `persona-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            name: item.name.trim(),
            readableMemory: String(item.readableMemory || ''),
            privateMemory: String(item.privateMemory || ''),
            allowPrivateForAI: Boolean(item.allowPrivateForAI),
          }))
          .filter((item) => item.name)
        if (normalized.length === 0) {
          setErrorText('导入失败：没有可用的人设模板')
          return
        }
        setPersonaTemplates((prev) => {
          const byName = new Map<string, PersonaTemplate>()
          for (const item of prev) byName.set(item.name, item)
          for (const item of normalized) byName.set(item.name, item)
          return Array.from(byName.values())
        })
        setSuccessText(`已导入 ${normalized.length} 个模板`)
      } catch {
        setErrorText('导入失败：JSON 格式不正确')
      }
    }
    reader.readAsText(file, 'utf-8')
    event.target.value = ''
  }

  if (isBooting) {
    return <div className="chat-app">加载中...</div>
  }

  return (
    <div
      className={`chat-app theme-${localTheme.nightMode ? 'night' : 'light'} ${
        uiFlags.newChatUI ? 'ui-chat-modern' : ''
      } ${uiFlags.newSettingsUI ? 'ui-settings-modern' : ''}`}
      style={{
        fontFamily: localTheme.fontFamily,
        backgroundImage: localTheme.wallpaperDataUrl ? `url(${localTheme.wallpaperDataUrl})` : undefined,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      {!hideTabBar ? (
        <div className="chat-toolbar">
          {mainTabOrder.map((tabKey) => (
            <PixelButton
              key={tabKey}
              size="sm"
              className={`${tab === tabKey ? 'tab-active' : ''} ${draggingMainTab === tabKey ? 'tab-dragging' : ''}`}
              draggable
              onDragStart={() => setDraggingMainTab(tabKey)}
              onDragEnd={() => setDraggingMainTab(null)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => {
                if (!draggingMainTab) return
                setMainTabOrder((prev) => reorderTabOrder(prev, draggingMainTab, tabKey))
                setDraggingMainTab(null)
              }}
              onClick={() => setTab(tabKey)}
            >
              {TAB_LABELS[tabKey]}
            </PixelButton>
          ))}
          <PixelButton onClick={onExit}>退出</PixelButton>
        </div>
      ) : (
        <div className="chat-toolbar">
          <strong>{appTitle || 'ROLE PHONE'}</strong>
          <PixelButton size="sm" className="ml-auto" onClick={onExit}>
            退出
          </PixelButton>
        </div>
      )}

      {hideTabBar && enableSettingsSubTabs ? (
        <div className="chat-toolbar">
          {SETTINGS_SUB_TAB_ORDER.map((tabKey) => (
            <PixelButton
              key={tabKey}
              size="sm"
              className={tab === tabKey ? 'tab-active' : ''}
              onClick={() => setTab(tabKey)}
            >
              {tabKey === 'settings' ? 'API设置' : '聊天样式'}
            </PixelButton>
          ))}
        </div>
      ) : null}

      {tab === 'roles' ? (
        <div className="role-list">
          <div className="role-list-actions">
            <PixelButton
              className="role-plus-trigger"
              variant="ghost"
              onClick={() => setShowRoleQuickMenu((prev) => !prev)}
            >
              ＋
            </PixelButton>
            {showRoleQuickMenu ? (
              <div className="role-quick-menu">
                <PixelButton
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setShowAddFriendForm(true)
                    setShowCreateGroupForm(false)
                    setShowRoleQuickMenu(false)
                  }}
                >
                  添加好友
                </PixelButton>
                <PixelButton
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setShowCreateGroupForm(true)
                    setShowAddFriendForm(false)
                    setShowRoleQuickMenu(false)
                  }}
                >
                  发起群聊
                </PixelButton>
              </div>
            ) : null}
          </div>
          {showAddFriendForm ? (
            <div className="worldbook-editor">
              <h4>添加好友</h4>
              <PixelInput
                placeholder="好友昵称"
                value={newFriendName}
                onChange={(event) => setNewFriendName(event.target.value)}
              />
              <PixelInput
                placeholder="备注（可选）"
                value={newFriendDescription}
                onChange={(event) => setNewFriendDescription(event.target.value)}
              />
              <label className="text-pixel-text-muted">{'{{CHAR}}'} 人设（必填）</label>
              <PixelInput
                as="textarea"
                rows={3}
                placeholder="填写 {{CHAR}} 人设（会写入角色身份设定）"
                value={newFriendCharPersona}
                onChange={(event) => setNewFriendCharPersona(event.target.value)}
              />
              <label className="text-pixel-text-muted">绑定世界书（可选）</label>
              <select
                className="pixel-select"
                value={newFriendWorldBookId}
                onChange={(event) => setNewFriendWorldBookId(event.target.value)}
              >
                <option value="">不绑定</option>
                {worldBooks.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
              <div className="chat-toolbar">
                <PixelButton
                  size="sm"
                  onClick={handleAddFriend}
                  disabled={!newFriendName.trim() || !newFriendCharPersona.trim()}
                >
                  确认添加
                </PixelButton>
                <PixelButton
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setShowAddFriendForm(false)
                    setNewFriendCharPersona('')
                    setNewFriendWorldBookId('')
                  }}
                >
                  取消
                </PixelButton>
              </div>
            </div>
          ) : null}
          {showCreateGroupForm ? (
            <div className="worldbook-editor">
              <h4>发起群聊</h4>
              <PixelInput
                placeholder="群聊名称"
                value={newGroupName}
                onChange={(event) => setNewGroupName(event.target.value)}
              />
              <label className="text-pixel-text-muted">选择成员（可多选）</label>
              <div className="group-member-list">
                {roles.map((role) => {
                  const checked = newGroupMemberIds.includes(role.id)
                  return (
                    <label key={role.id} className="group-member-item">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          setNewGroupMemberIds((prev) =>
                            checked ? prev.filter((id) => id !== role.id) : [...prev, role.id],
                          )
                        }
                      />
                      <span>{role.name}</span>
                    </label>
                  )
                })}
              </div>
              <div className="chat-toolbar">
                <PixelButton size="sm" onClick={handleCreateGroup}>
                  创建群聊
                </PixelButton>
                <PixelButton size="sm" variant="ghost" onClick={() => setShowCreateGroupForm(false)}>
                  取消
                </PixelButton>
              </div>
            </div>
          ) : null}
          {roles.map((role) => (
            <button key={role.id} className={`role-card ${selectedRoleId === role.id ? 'active' : ''}`} onClick={() => openConversation(role)}>
              <span className="role-avatar">{role.avatar || role.name.slice(0, 1)}</span>
              <span className="role-meta">
                <strong>{role.name}</strong>
                <small>{role.description || '暂无描述'}</small>
              </span>
            </button>
          ))}
        </div>
      ) : null}

      {tab === 'chat' ? (
        <div className={`wechat-shell ${uiFlags.newChatUI ? 'wechat-shell-modern' : ''}`}>
          {(chatViewMode === 'list' || !selectedRole) && (
            <div className="conversation-list">
              <div className="wechat-head">消息</div>
              {sortedRoles.map((role) => {
                const sessionId = getSessionId(role.id)
                const snapshot = sessionMap[sessionId] ?? defaultSessionState()
                const last = snapshot.messages.at(-1)
                const unread = unreadMap[role.id] ?? 0
                const pinned = Boolean(pinnedRoleIds[role.id])
                return (
                  <button key={role.id} className={`conversation-item ${role.id === selectedRoleId ? 'active' : ''}`} onClick={() => openConversation(role)}>
                    <span className="role-avatar">{role.avatar || role.name.slice(0, 1)}</span>
                    <span className="conversation-meta">
                      <strong className="conversation-title-row">
                        <span>{role.name}</span>
                        {pinned ? <span className="pin-flag">置顶</span> : null}
                      </strong>
                      <small>{last?.content || '点击开始聊天'}</small>
                    </span>
                    {unread > 0 ? <span className="badge-unread">{Math.min(99, unread)}</span> : null}
                  </button>
                )
              })}
            </div>
          )}

          {selectedRole && chatViewMode === 'detail' && (
            <div className="chat-detail">
              <div className="wechat-chat-header">
                <PixelButton size="sm" variant="ghost" onClick={() => setChatViewMode('list')}>
                  返回
                </PixelButton>
                <span className="chat-header-title">
                  {selectedRole.name}
                  {isSelectedRoleBlocked ? <em className="blocked-flag">黑名单</em> : null}
                </span>
                <div className="chat-header-actions">
                  <PixelButton size="sm" variant="ghost" onClick={() => startCall('voice')}>
                    语音
                  </PixelButton>
                  <PixelButton size="sm" variant="ghost" onClick={() => startCall('video')}>
                    视频
                  </PixelButton>
                </div>
                <PixelButton size="sm" variant="ghost" onClick={() => setShowPlusPanel((prev) => !prev)}>
                  ⋯
                </PixelButton>
              </div>

              <div
                className={`chat-panel ${uiFlags.newChatUI ? 'chat-panel-modern' : ''}`}
                style={{
                  backgroundImage: localTheme.wallpaperDataUrl ? `url(${localTheme.wallpaperDataUrl})` : undefined,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                }}
              >
                {activeSession.messages.length === 0 ? (
                  <p className="text-pixel-text-muted">输入第一条消息开始对话</p>
                ) : null}
                {activeSession.messages.map((message, index) => (
                  <div
                    key={`${message.role}-${index}-${message.timestamp}`}
                    className={`message-row ${message.role === 'user' ? 'user' : 'assistant'}`}
                  >
                    {!shouldHideAvatar(
                      chatSettings.hideAvatarMode,
                      message.role === 'assistant' ? 'assistant' : 'user',
                    ) ? (
                      <span
                        className="bubble-avatar"
                        style={{
                          borderColor: localTheme.avatarFrameColor,
                          borderWidth: `${localTheme.avatarFrameSize}px`,
                        }}
                      >
                        <span>{message.role === 'user' ? '我' : selectedRole.avatar || selectedRole.name.slice(0, 1)}</span>
                        {localTheme.avatarPendant ? (
                          <i className="avatar-pendant">{localTheme.avatarPendant.slice(0, 2)}</i>
                        ) : null}
                      </span>
                    ) : null}
                    <article
                      className={`bubble ${message.role === 'user' ? 'user' : 'assistant'} bubble-with-style`}
                      style={{
                        background:
                          message.role === 'user'
                            ? chatSettings.myBubbleColor
                            : chatSettings.friendBubbleColor,
                      }}
                      onContextMenu={(event) => {
                        event.preventDefault()
                        openMessageActionMenu(index, message, event.clientX, event.clientY)
                      }}
                      onMouseDown={(event) =>
                        scheduleLongPressMenu(index, message, event.clientX, event.clientY)
                      }
                      onMouseUp={clearLongPressTimer}
                      onMouseLeave={clearLongPressTimer}
                      onTouchStart={(event) => {
                        const touch = event.touches[0]
                        if (!touch) return
                        scheduleLongPressMenu(index, message, touch.clientX, touch.clientY)
                      }}
                      onTouchEnd={clearLongPressTimer}
                      onTouchCancel={clearLongPressTimer}
                    >
                      <p className="bubble-role">{message.role === 'user' ? '我' : selectedRole.name}</p>
                      <p>{message.content}</p>
                      {chatSettings.showTimestamp && chatSettings.timestampStyle === 'bubble' ? (
                        <p className="bubble-extra">
                          {formatMessageTime(message.timestamp, chatSettings.showSeconds)}
                        </p>
                      ) : null}
                      {chatSettings.showReadReceipt &&
                      message.role === 'user' &&
                      chatSettings.readReceiptStyle === 'bubble' ? (
                        <p className="bubble-extra bubble-read">已读</p>
                      ) : null}
                    </article>
                    <div className="bubble-side-meta">
                      {chatSettings.showTimestamp && chatSettings.timestampStyle === 'avatar' ? (
                        <span>{formatMessageTime(message.timestamp, chatSettings.showSeconds)}</span>
                      ) : null}
                      {chatSettings.showReadReceipt &&
                      message.role === 'user' &&
                      chatSettings.readReceiptStyle === 'avatar' ? (
                        <span>已读</span>
                      ) : null}
                    </div>
                  </div>
                ))}
                {messageActionMenu ? (
                  <div
                    className="message-action-menu"
                    style={{
                      left: `${messageActionMenu.x}px`,
                      top: `${messageActionMenu.y}px`,
                    }}
                    onMouseLeave={() => setMessageActionMenu(null)}
                  >
                    <button
                      type="button"
                      className="message-action-item"
                      onClick={() => void handleCopyMessage(messageActionMenu.message.content)}
                    >
                      复制
                    </button>
                    <button
                      type="button"
                      className="message-action-item"
                      onClick={() => handleDeleteMessage(messageActionMenu.index)}
                    >
                      删除
                    </button>
                    <button
                      type="button"
                      className="message-action-item"
                      onClick={() =>
                        handleRecallMessage(messageActionMenu.index, messageActionMenu.message)
                      }
                    >
                      撤回
                    </button>
                  </div>
                ) : null}
              </div>

              <div className="memory-panel">
                <p>记忆摘要：{activeSession.memory.summary || '暂无'}</p>
                <p>关键事实：{activeSession.memory.facts.length ? activeSession.memory.facts.join('；') : '暂无'}</p>
                <p>角色世界书：{roleWorldBook?.name || '未绑定'}</p>
                <p>会话世界书：{sessionWorldBook?.name || '未绑定'}</p>
                <p>记忆互通：{isMemorySyncEnabled ? '开启' : '关闭'}</p>
              </div>

              {showPlusPanel ? (
                <div className="plus-panel">
                  <label className="text-pixel-text-muted">会话绑定世界书</label>
                  <select
                    className="pixel-select"
                    value={activeSession.sessionWorldBookId}
                    onChange={(event) => void handleBindSessionWorldBook(event.target.value)}
                  >
                    <option value="">不绑定</option>
                    {worldBooks.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                  <PixelButton size="sm" variant="ghost" onClick={() => setShowPlusPanel(false)}>
                    收起
                  </PixelButton>
                  <div className="plus-actions">
                    <PixelButton size="sm" variant="ghost" onClick={togglePinSelectedConversation}>
                      {selectedRoleId && pinnedRoleIds[selectedRoleId] ? '取消置顶' : '置顶聊天'}
                    </PixelButton>
                    <PixelButton size="sm" variant="ghost" onClick={markCurrentConversationUnread}>
                      标记未读
                    </PixelButton>
                    <PixelButton size="sm" variant="ghost" onClick={toggleMemorySyncSelectedRole}>
                      {isMemorySyncEnabled ? '关闭记忆互通' : '开启记忆互通'}
                    </PixelButton>
                    <PixelButton size="sm" variant="ghost" onClick={recallLastUserMessage}>
                      撤回我上一条
                    </PixelButton>
                    <PixelButton size="sm" variant="ghost" onClick={() => setText((prev) => `${prev}${prev ? '\n' : ''}📷 [发送了一张照片]`)}>
                      照片
                    </PixelButton>
                    <PixelButton size="sm" variant="ghost" onClick={() => setText((prev) => `${prev}${prev ? '\n' : ''}🎧 一起听歌吗？`)}>
                      一起听
                    </PixelButton>
                    <PixelButton size="sm" variant="ghost" onClick={() => setText((prev) => `${prev}${prev ? '\n' : ''}📍 [发送了位置]`)}>
                      位置
                    </PixelButton>
                    <PixelButton size="sm" variant="ghost" onClick={() => setText((prev) => `${prev}${prev ? '\n' : ''}💸 [发起了转账]`)}>
                      转账
                    </PixelButton>
                    <PixelButton size="sm" variant="danger" onClick={clearActiveConversation}>
                      清空聊天
                    </PixelButton>
                    <PixelButton size="sm" variant="danger" onClick={toggleBlockSelectedRole}>
                      {isSelectedRoleBlocked ? '移出黑名单' : '加入黑名单'}
                    </PixelButton>
                  </div>
                </div>
              ) : null}

              <div className={`chat-input-row ${uiFlags.newChatUI ? 'chat-input-row-modern' : ''}`}>
                <PixelButton size="sm" variant="ghost" onClick={() => setShowPlusPanel((prev) => !prev)}>
                  +
                </PixelButton>
                <PixelInput
                  as="textarea"
                  className="chat-input"
                  placeholder={isSelectedRoleBlocked ? '已拉黑，无法发送消息' : '输入消息...'}
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                  disabled={isSelectedRoleBlocked}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault()
                      void handleSend(text)
                    }
                  }}
                  rows={2}
                />
                <PixelButton
                  disabled={isSending || !text.trim() || !selectedRoleId || isSelectedRoleBlocked}
                  onClick={() => handleSend(text)}
                >
                  {isSending ? '发送中...' : '发送'}
                </PixelButton>
              </div>
              {isSelectedRoleBlocked ? (
                <div className="blocked-tip">你已将对方加入黑名单，无法发送消息</div>
              ) : null}
            </div>
          )}
        </div>
      ) : null}

      {tab === 'editor' ? (
        <div className="editor-panel">
          <div className="worldbook-editor">
            <h4>我的人设记忆（{'{{user}}'}）</h4>
            <label className="text-pixel-text-muted">可给 AI（{'{{CHAR}}'}）读取</label>
            <PixelInput
              as="textarea"
              rows={4}
              placeholder="例如：我的称呼偏好、禁忌话题、互动喜好等"
              value={userPersona.readableMemory}
              onChange={(event) =>
                setUserPersona((prev) => ({ ...prev, readableMemory: event.target.value }))
              }
            />
            <label className="text-pixel-text-muted">默认不让 AI（{'{{CHAR}}'}）读取</label>
            <PixelInput
              as="textarea"
              rows={4}
              placeholder="例如：仅自己可见的背景与隐私记忆"
              value={userPersona.privateMemory}
              onChange={(event) =>
                setUserPersona((prev) => ({ ...prev, privateMemory: event.target.value }))
              }
            />
            <label className="text-pixel-text-muted">是否授权 AI（{'{{CHAR}}'}）读取私有板块</label>
            <select
              className="pixel-select"
              value={userPersona.allowPrivateForAI ? '1' : '0'}
              onChange={(event) =>
                setUserPersona((prev) => ({ ...prev, allowPrivateForAI: event.target.value === '1' }))
              }
            >
              <option value="0">否（保持私有）</option>
              <option value="1">是（允许读取）</option>
            </select>
            <PixelInput
              placeholder="保存名称（可选，留空自动命名）"
              value={personaTemplateName}
              onChange={(event) => setPersonaTemplateName(event.target.value)}
            />
            <PixelButton onClick={handleSaveUserPersona} disabled={isSavingUserPersona}>
              {isSavingUserPersona ? '保存中...' : '保存用户人设记忆'}
            </PixelButton>
          </div>
          <div className="worldbook-editor">
            <div className="chat-toolbar">
              <h4 className="persona-shelf-title">更多人设（{personaTemplates.length}）</h4>
              <PixelButton
                size="sm"
                variant="ghost"
                className="ml-auto"
                onClick={() => setIsPersonaShelfOpen((prev) => !prev)}
              >
                {isPersonaShelfOpen ? '收起' : '展开'}
              </PixelButton>
            </div>
            {isPersonaShelfOpen ? (
              <>
                <label className="text-pixel-text-muted">保存当前输入为人设模板</label>
                <div className="chat-toolbar">
                  <PixelInput
                    className="persona-template-input"
                    placeholder="例如：温柔日常/高冷毒舌"
                    value={personaTemplateName}
                    onChange={(event) => setPersonaTemplateName(event.target.value)}
                  />
                  <PixelButton size="sm" onClick={saveCurrentPersonaAsTemplate}>
                    保存人设
                  </PixelButton>
                </div>
                <div className="chat-toolbar">
                  <PixelButton size="sm" variant="ghost" onClick={exportPersonaTemplates}>
                    导出JSON
                  </PixelButton>
                  <PixelButton
                    size="sm"
                    variant="ghost"
                    onClick={() => personaImportInputRef.current?.click()}
                  >
                    导入JSON
                  </PixelButton>
                  <input
                    ref={personaImportInputRef}
                    type="file"
                    accept="application/json,.json"
                    className="hidden-file-input"
                    onChange={importPersonaTemplates}
                  />
                </div>
                {personaTemplates.length === 0 ? (
                  <p className="text-pixel-text-muted">暂无已保存人设</p>
                ) : (
                  <div className="persona-template-list">
                    {personaTemplates.map((template) => (
                      <div
                        key={template.id}
                        className={`persona-template-item ${
                          highlightedPersonaTemplateId === template.id ? 'highlighted' : ''
                        }`}
                      >
                        <div className="persona-template-meta">
                          <strong>{template.name}</strong>
                          <small>
                            可读记忆 {template.readableMemory.length} 字 / 私有记忆 {template.privateMemory.length} 字
                          </small>
                        </div>
                        <div className="chat-toolbar">
                          <PixelButton size="sm" variant="ghost" onClick={() => applyPersonaTemplate(template)}>
                            加载
                          </PixelButton>
                          <PixelButton
                            size="sm"
                            variant="danger"
                            onClick={() => deletePersonaTemplate(template.id)}
                          >
                            删除
                          </PixelButton>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : null}
          </div>
        </div>
      ) : null}

      {tab === 'worldbook' ? (
        <div className="editor-panel">
          <div className="worldbook-editor">
            <h4>当前会话与角色</h4>
            <p className="text-pixel-text-muted">
              当前联系人：{selectedRole?.name || '未选择'}
            </p>
            <p className="text-pixel-text-muted">角色绑定世界书：{roleWorldBook?.name || '未绑定'}</p>
            <p className="text-pixel-text-muted">会话绑定世界书：{sessionWorldBook?.name || '未绑定'}</p>
            <label className="text-pixel-text-muted">为当前联系人绑定世界书</label>
            <select
              className="pixel-select"
              value={selectedWorldBookIdForRole}
              onChange={(event) => setSelectedWorldBookIdForRole(event.target.value)}
            >
              <option value="">不绑定</option>
              {worldBooks.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
            <div className="chat-toolbar">
              <PixelButton size="sm" onClick={() => void handleBindRoleWorldBook(selectedWorldBookIdForRole)}>
                保存联系人绑定
              </PixelButton>
              <PixelButton size="sm" variant="ghost" onClick={() => setSelectedWorldBookIdForRole('')}>
                清空选择
              </PixelButton>
            </div>
          </div>

          <div className="worldbook-editor">
            <h4>新增世界书</h4>
            <PixelInput
              placeholder="世界书名称"
              value={newWorldBookName}
              onChange={(event) => setNewWorldBookName(event.target.value)}
            />
            <PixelInput
              as="textarea"
              rows={6}
              placeholder="世界书内容（会注入到角色对话上下文）"
              value={newWorldBookContent}
              onChange={(event) => setNewWorldBookContent(event.target.value)}
            />
            <div className="chat-toolbar">
              <PixelButton size="sm" onClick={() => void handleCreateWorldBook()}>
                创建世界书
              </PixelButton>
            </div>
          </div>

          <div className="worldbook-editor">
            <h4>世界书列表</h4>
            {worldBooks.length === 0 ? (
              <p className="text-pixel-text-muted">暂无世界书，先创建一个吧</p>
            ) : (
              <div className="worldbook-list">
                {worldBooks.map((book) => (
                  <article key={book.id} className="worldbook-item">
                    <div className="worldbook-item-head">
                      <strong>{book.name}</strong>
                      <PixelButton
                        size="sm"
                        variant="ghost"
                        onClick={() => setSelectedWorldBookIdForRole(book.id)}
                      >
                        选中绑定
                      </PixelButton>
                    </div>
                    <p>{book.content || '（暂无内容）'}</p>
                  </article>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : null}

      {tab === 'settings' ? (
        <div className={`editor-panel ${uiFlags.newSettingsUI ? 'settings-modern-layout' : ''}`}>
          <div className="worldbook-editor settings-flag-panel">
            <h4>界面升级开关</h4>
            <p className="text-pixel-text-muted">可按模块灰度启用，关闭后立即回退旧界面。</p>
            <div className="settings-toggle-grid">
              <label className="settings-toggle-item">
                <span>首页与导航新样式</span>
                <select
                  className="pixel-select"
                  value={uiFlags.newHomeUI ? '1' : '0'}
                  onChange={(event) => updateUiFlag('newHomeUI', event.target.value === '1')}
                >
                  <option value="1">开启</option>
                  <option value="0">关闭</option>
                </select>
              </label>
              <label className="settings-toggle-item">
                <span>聊天页新样式</span>
                <select
                  className="pixel-select"
                  value={uiFlags.newChatUI ? '1' : '0'}
                  onChange={(event) => updateUiFlag('newChatUI', event.target.value === '1')}
                >
                  <option value="1">开启</option>
                  <option value="0">关闭</option>
                </select>
              </label>
              <label className="settings-toggle-item">
                <span>设置页新样式</span>
                <select
                  className="pixel-select"
                  value={uiFlags.newSettingsUI ? '1' : '0'}
                  onChange={(event) => updateUiFlag('newSettingsUI', event.target.value === '1')}
                >
                  <option value="1">开启</option>
                  <option value="0">关闭</option>
                </select>
              </label>
            </div>
          </div>
          <div className="worldbook-editor">
            <h4>API 设置</h4>
            <label className="text-pixel-text-muted">连接配置</label>
            <div className="chat-toolbar">
              <PixelButton size="sm" variant="ghost" onClick={openApiPresetSelector}>
                选择预设
              </PixelButton>
              <PixelButton size="sm" variant="ghost" onClick={saveCurrentApiPreset}>
                保存当前预设
              </PixelButton>
            </div>
            <label className="text-pixel-text-muted">API 地址</label>
            <PixelInput
              placeholder="例如：https://api.openai.com/v1"
              value={apiUi.apiUrl}
              onChange={(event) => setApiUi((prev) => ({ ...prev, apiUrl: event.target.value }))}
            />
            <label className="text-pixel-text-muted">API Key</label>
            <PixelInput
              placeholder={maskedKey ? `已保存: ${maskedKey}（留空不更新）` : 'sk-...'}
              value={apiUi.apiKey}
              onChange={(event) => setApiUi((prev) => ({ ...prev, apiKey: event.target.value }))}
            />
            <label className="text-pixel-text-muted">模型名称</label>
            <PixelInput
              placeholder="点击拉取后可自动选择，或手动输入"
              value={apiUi.modelName}
              onChange={(event) => setApiUi((prev) => ({ ...prev, modelName: event.target.value }))}
            />
            {apiUi.fetchedModels.length > 0 ? (
              <>
                <label className="text-pixel-text-muted">模型列表</label>
                <select
                  className="pixel-select"
                  value={apiUi.modelName}
                  onChange={(event) => setApiUi((prev) => ({ ...prev, modelName: event.target.value }))}
                >
                  {apiUi.fetchedModels.map((modelName) => (
                    <option key={modelName} value={modelName}>
                      {modelName}
                    </option>
                  ))}
                </select>
              </>
            ) : null}
            <div className="chat-toolbar">
              <PixelButton size="sm" variant="ghost" onClick={() => void fetchModelList()}>
                拉取模型列表
              </PixelButton>
            </div>
            <label className="text-pixel-text-muted">记忆条数</label>
            <PixelInput
              type="number"
              min={1}
              max={100}
              value={String(apiUi.memoryCount)}
              onChange={(event) =>
                setApiUi((prev) => ({
                  ...prev,
                  memoryCount: Math.max(1, Number(event.target.value) || 1),
                }))
              }
            />
            <small className="text-pixel-text-muted">
              聊天时 AI 读取的消息条数，最终记忆取决于 Token 数。
            </small>
            <label className="text-pixel-text-muted">温度 (0-2)</label>
            <PixelInput
              type="number"
              min={0}
              max={2}
              step={0.1}
              value={String(apiUi.temperature)}
              onChange={(event) =>
                setApiUi((prev) => ({
                  ...prev,
                  temperature: Math.max(0, Math.min(2, Number(event.target.value) || 0)),
                }))
              }
            />
            <small className="text-pixel-text-muted">
              温度越低越稳定精准，越高越有创造性和随机性。
            </small>
            <label className="text-pixel-text-muted">AI 时间感知</label>
            <select
              className="pixel-select"
              value={apiUi.timeAware ? '1' : '0'}
              onChange={(event) =>
                setApiUi((prev) => ({ ...prev, timeAware: event.target.value === '1' }))
              }
            >
              <option value="1">开启</option>
              <option value="0">关闭</option>
            </select>
            <details>
              <summary className="text-pixel-text-muted">附加 Headers（高级）</summary>
              <PixelInput
                as="textarea"
                rows={4}
                placeholder='例如：{"x-org-id":"demo"}'
                value={headersText}
                onChange={(event) => setHeadersText(event.target.value)}
              />
            </details>
            <div className="chat-toolbar">
              <PixelButton onClick={handleSaveConfig} disabled={isSavingConfig}>
                {isSavingConfig ? '保存中...' : '保存全部设置'}
              </PixelButton>
              <PixelButton variant="ghost" onClick={handleExportData}>
                导出数据
              </PixelButton>
            </div>
          </div>
        </div>
      ) : null}

      {tab === 'chat-style' ? (
        <div className={`editor-panel ${uiFlags.newSettingsUI ? 'settings-modern-layout' : ''}`}>
          <section className={`worldbook-editor ${uiFlags.newSettingsUI ? 'settings-card' : ''}`}>
            <h4>聊天设置</h4>
          <label className="text-pixel-text-muted">显示时间戳</label>
          <select
            className="pixel-select"
            value={chatSettings.showTimestamp ? '1' : '0'}
            onChange={(event) =>
              setChatSettings((prev) => ({ ...prev, showTimestamp: event.target.value === '1' }))
            }
          >
            <option value="1">开启</option>
            <option value="0">关闭</option>
          </select>
          <label className="text-pixel-text-muted">时间戳样式</label>
          <select
            className="pixel-select"
            value={chatSettings.timestampStyle}
            onChange={(event) =>
              setChatSettings((prev) => ({ ...prev, timestampStyle: event.target.value as TimestampStyle }))
            }
          >
            <option value="bubble">气泡下面</option>
            <option value="avatar">头像下面</option>
            <option value="hidden">隐藏</option>
          </select>
          <label className="text-pixel-text-muted">显示秒数</label>
          <select
            className="pixel-select"
            value={chatSettings.showSeconds ? '1' : '0'}
            onChange={(event) =>
              setChatSettings((prev) => ({ ...prev, showSeconds: event.target.value === '1' }))
            }
          >
            <option value="1">开启</option>
            <option value="0">关闭</option>
          </select>
          <label className="text-pixel-text-muted">显示已读</label>
          <select
            className="pixel-select"
            value={chatSettings.showReadReceipt ? '1' : '0'}
            onChange={(event) =>
              setChatSettings((prev) => ({ ...prev, showReadReceipt: event.target.value === '1' }))
            }
          >
            <option value="1">开启</option>
            <option value="0">关闭</option>
          </select>
          <label className="text-pixel-text-muted">已读样式</label>
          <select
            className="pixel-select"
            value={chatSettings.readReceiptStyle}
            onChange={(event) =>
              setChatSettings((prev) => ({ ...prev, readReceiptStyle: event.target.value as ReadReceiptStyle }))
            }
          >
            <option value="bubble">气泡下面</option>
            <option value="avatar">头像下面</option>
            <option value="hidden">隐藏</option>
          </select>
          <label className="text-pixel-text-muted">隐藏头像模式</label>
          <select
            className="pixel-select"
            value={chatSettings.hideAvatarMode}
            onChange={(event) =>
              setChatSettings((prev) => ({ ...prev, hideAvatarMode: event.target.value as HideAvatarMode }))
            }
          >
            <option value="none">不隐藏</option>
            <option value="both">隐藏双方头像</option>
            <option value="friend">只隐藏好友头像</option>
            <option value="me">只隐藏我的头像</option>
          </select>
          <label className="text-pixel-text-muted">我的气泡颜色</label>
          <input
            className="pixel-input"
            type="color"
            value={chatSettings.myBubbleColor}
            onChange={(event) =>
              setChatSettings((prev) => ({ ...prev, myBubbleColor: event.target.value }))
            }
          />
          <label className="text-pixel-text-muted">对方气泡颜色</label>
          <input
            className="pixel-input"
            type="color"
            value={chatSettings.friendBubbleColor}
            onChange={(event) =>
              setChatSettings((prev) => ({ ...prev, friendBubbleColor: event.target.value }))
            }
          />
          <label className="text-pixel-text-muted">按钮音效（BIP）</label>
          <select
            className="pixel-select"
            value={chatSettings.buttonBipEnabled ? '1' : '0'}
            onChange={(event) => {
              const enabled = event.target.value === '1'
              setChatSettings((prev) => ({ ...prev, buttonBipEnabled: enabled }))
              setButtonBipEnabled(enabled)
            }}
          >
            <option value="1">开启</option>
            <option value="0">关闭</option>
          </select>
          </section>
          <section className={`worldbook-editor ${uiFlags.newSettingsUI ? 'settings-card' : ''}`}>
            <h4>主题美化</h4>
          <label className="text-pixel-text-muted">字体</label>
          <select
            className="pixel-select"
            value={localTheme.fontFamily}
            onChange={(event) =>
              setLocalTheme((prev) => ({ ...prev, fontFamily: event.target.value }))
            }
          >
            <option value='system-ui, "PingFang SC", "Microsoft YaHei", sans-serif'>系统默认</option>
            <option value='"Microsoft YaHei", sans-serif'>微软雅黑</option>
            <option value='"PingFang SC", sans-serif'>苹方</option>
            <option value='ui-monospace, "Cascadia Code", Consolas, monospace'>等宽字体</option>
          </select>
          <label className="text-pixel-text-muted">夜间模式</label>
          <select
            className="pixel-select"
            value={localTheme.nightMode ? '1' : '0'}
            onChange={(event) =>
              setLocalTheme((prev) => ({ ...prev, nightMode: event.target.value === '1' }))
            }
          >
            <option value="0">关闭</option>
            <option value="1">开启</option>
          </select>
          <label className="text-pixel-text-muted">头像挂件</label>
          <PixelInput
            placeholder="例如：💫 / ✨ / ❤"
            value={localTheme.avatarPendant}
            onChange={(event) =>
              setLocalTheme((prev) => ({ ...prev, avatarPendant: event.target.value }))
            }
          />
          <label className="text-pixel-text-muted">头像边框颜色</label>
          <input
            className="pixel-input"
            type="color"
            value={localTheme.avatarFrameColor}
            onChange={(event) =>
              setLocalTheme((prev) => ({ ...prev, avatarFrameColor: event.target.value }))
            }
          />
          <label className="text-pixel-text-muted">头像边框大小（px）</label>
          <input
            className="pixel-input"
            type="range"
            min={0}
            max={6}
            value={localTheme.avatarFrameSize}
            onChange={(event) =>
              setLocalTheme((prev) => ({
                ...prev,
                avatarFrameSize: Number(event.target.value),
              }))
            }
          />
          <label className="text-pixel-text-muted">聊天壁纸</label>
          <div className="chat-toolbar">
            <PixelButton size="sm" variant="ghost" onClick={() => fileInputRef.current?.click()}>
              上传壁纸
            </PixelButton>
            <PixelButton
              size="sm"
              variant="ghost"
              onClick={() => setLocalTheme((prev) => ({ ...prev, wallpaperDataUrl: '' }))}
            >
              清空壁纸
            </PixelButton>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden-file-input"
            onChange={handleWallpaperUpload}
          />
          </section>
          <section className={`worldbook-editor ${uiFlags.newSettingsUI ? 'settings-card' : ''}`}>
            <div className="style-preview">
            <p className="text-pixel-text-muted">实时预览</p>
            <div className="message-row assistant">
              {!shouldHideAvatar(chatSettings.hideAvatarMode, 'assistant') ? (
                <span
                  className="bubble-avatar"
                  style={{
                    borderColor: localTheme.avatarFrameColor,
                    borderWidth: `${localTheme.avatarFrameSize}px`,
                  }}
                >
                  <span>TA</span>
                  {localTheme.avatarPendant ? (
                    <i className="avatar-pendant">{localTheme.avatarPendant.slice(0, 2)}</i>
                  ) : null}
                </span>
              ) : null}
              <article className="bubble assistant bubble-with-style" style={{ background: chatSettings.friendBubbleColor }}>
                <p className="bubble-role">TA</p>
                <p>这是对方消息预览</p>
                {chatSettings.showTimestamp && chatSettings.timestampStyle === 'bubble' ? (
                  <p className="bubble-extra">18:29</p>
                ) : null}
              </article>
              <div className="bubble-side-meta">
                {chatSettings.showTimestamp && chatSettings.timestampStyle === 'avatar' ? <span>18:29</span> : null}
              </div>
            </div>
            <div className="message-row user">
              {!shouldHideAvatar(chatSettings.hideAvatarMode, 'user') ? (
                <span
                  className="bubble-avatar"
                  style={{
                    borderColor: localTheme.avatarFrameColor,
                    borderWidth: `${localTheme.avatarFrameSize}px`,
                  }}
                >
                  <span>我</span>
                  {localTheme.avatarPendant ? (
                    <i className="avatar-pendant">{localTheme.avatarPendant.slice(0, 2)}</i>
                  ) : null}
                </span>
              ) : null}
              <article className="bubble user bubble-with-style" style={{ background: chatSettings.myBubbleColor }}>
                <p className="bubble-role">我</p>
                <p>这是我的消息预览</p>
                {chatSettings.showReadReceipt && chatSettings.readReceiptStyle === 'bubble' ? (
                  <p className="bubble-extra bubble-read">已读</p>
                ) : null}
              </article>
              <div className="bubble-side-meta">
                {chatSettings.showReadReceipt && chatSettings.readReceiptStyle === 'avatar' ? <span>已读</span> : null}
              </div>
            </div>
            </div>
            <PixelButton onClick={handleSaveChatSettings} disabled={isSavingChatSettings}>
              {isSavingChatSettings ? '保存中...' : '保存聊天设置'}
            </PixelButton>
          </section>
        </div>
      ) : null}

      {callOverlay && selectedRole ? (
        <div className="call-overlay">
          <div className={`call-card ${uiFlags.newChatUI ? 'call-card-modern' : ''}`}>
            <p className="text-pixel-text-muted">
              {callOverlay.mode === 'voice' ? '语音通话' : '视频通话'}
            </p>
            <h4>{selectedRole.name}</h4>
            <p>
              {callOverlay.status === 'ringing'
                ? '邀请你进行通话...'
                : callOverlay.mode === 'voice'
                  ? '语音通话中 00:00'
                  : '视频通话中 00:00'}
            </p>
            <div className="chat-toolbar">
              {callOverlay.status === 'ringing' ? (
                <>
                  <PixelButton variant="danger" onClick={hangupCall}>
                    拒绝
                  </PixelButton>
                  <PixelButton onClick={acceptCall}>接听</PixelButton>
                </>
              ) : (
                <>
                  <PixelButton variant="ghost">
                    {callOverlay.mode === 'voice' ? '免提' : '翻转'}
                  </PixelButton>
                  <PixelButton variant="ghost">静音</PixelButton>
                  <PixelButton variant="danger" onClick={hangupCall}>
                    挂断
                  </PixelButton>
                </>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {errorText ? <div className="pixel-error">{errorText}</div> : null}
      {successText ? <div className="pixel-success">{successText}</div> : null}
    </div>
  )
}
