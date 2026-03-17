import type {
  AIConfigInput,
  AIConfigPublic,
  ChatUiSettings,
  ChatResponse,
  AutomationSettings,
  ConversationSnapshot,
  ForumPost,
  LicenseStatus,
  MomentPost,
  MusicState,
  RoleProfile,
  UserPersonaMemory,
  WorldBook,
} from './types'
import { UnifiedApiError } from './types'

const API_BASE =
  import.meta.env.VITE_API_BASE_URL ?? (import.meta.env.PROD ? '' : 'http://localhost:3030')

type RequestOptions = RequestInit & {
  timeoutMs?: number
}

async function request<T>(path: string, options: RequestOptions = {}) {
  const controller = new AbortController()
  const timeoutMs = options.timeoutMs ?? 30000
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers ?? {}),
      },
      signal: controller.signal,
    })
    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as {
        code?: string
        message?: string
      }
      throw new UnifiedApiError(
        payload.code ?? 'request_failed',
        response.status,
        payload.message ?? `请求失败（HTTP ${response.status}）`,
      )
    }
    return (await response.json()) as T
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new UnifiedApiError('timeout', 408, '请求超时，请稍后重试')
    }
    if (error instanceof TypeError) {
      const base = API_BASE || window.location.origin
      throw new UnifiedApiError(
        'network_unreachable',
        0,
        `无法连接到 API 服务（${base}）。请确认后端已启动且地址配置正确。`,
      )
    }
    throw error
  } finally {
    clearTimeout(timer)
  }
}

export async function fetchRoles() {
  const result = await request<{ roles: RoleProfile[] }>('/api/roles', { method: 'GET' })
  return result.roles
}

export async function createRole(input: Omit<RoleProfile, 'id' | 'createdAt' | 'updatedAt'>) {
  const result = await request<{ role: RoleProfile }>('/api/roles', {
    method: 'POST',
    body: JSON.stringify(input),
  })
  return result.role
}

export async function updateRole(
  roleId: string,
  input: Omit<RoleProfile, 'id' | 'createdAt' | 'updatedAt'>,
) {
  const result = await request<{ role: RoleProfile }>(`/api/roles/${roleId}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  })
  return result.role
}

export async function fetchConfig() {
  return request<AIConfigPublic>('/api/config', { method: 'GET' })
}

export async function saveConfig(input: AIConfigInput) {
  return request<{ ok: boolean; hasApiKey: boolean; maskedApiKey: string }>('/api/config', {
    method: 'PUT',
    body: JSON.stringify(input),
  })
}

export async function fetchChatSettings() {
  return request<ChatUiSettings>('/api/chat-settings', { method: 'GET' })
}

export async function saveChatSettings(input: ChatUiSettings) {
  return request<{ ok: boolean; chatUiSettings: ChatUiSettings }>('/api/chat-settings', {
    method: 'PUT',
    body: JSON.stringify(input),
  })
}

export async function fetchUserPersona() {
  return request<UserPersonaMemory>('/api/user-persona', { method: 'GET' })
}

export async function saveUserPersona(input: UserPersonaMemory) {
  return request<{ ok: boolean; userPersona: UserPersonaMemory }>('/api/user-persona', {
    method: 'PUT',
    body: JSON.stringify(input),
  })
}

export async function sendRoleMessage(input: { roleId: string; sessionId: string; message: string }) {
  return request<ChatResponse>('/api/chat', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export async function fetchWorldBooks() {
  const result = await request<{ worldBooks: WorldBook[] }>('/api/worldbooks', { method: 'GET' })
  return result.worldBooks
}

export async function createWorldBook(input: { name: string; content: string }) {
  const result = await request<{ worldBook: WorldBook }>('/api/worldbooks', {
    method: 'POST',
    body: JSON.stringify(input),
  })
  return result.worldBook
}

export async function bindRoleWorldBook(roleId: string, worldBookId: string) {
  return request<{ ok: boolean; role: RoleProfile }>(`/api/roles/${roleId}/worldbook`, {
    method: 'PUT',
    body: JSON.stringify({ worldBookId }),
  })
}

export async function bindSessionWorldBook(sessionId: string, roleId: string, worldBookId: string) {
  return request<{ ok: boolean; sessionId: string; worldBookId: string }>(
    `/api/sessions/${sessionId}/worldbook`,
    {
      method: 'PUT',
      body: JSON.stringify({ roleId, worldBookId }),
    },
  )
}

export async function exportData() {
  return request<Record<string, unknown>>('/api/export', { method: 'GET' })
}

export async function importData(data: Record<string, unknown>) {
  return request<{ ok: boolean; roles: number; worldBooks: number; conversations: number }>('/api/import', {
    method: 'POST',
    body: JSON.stringify({ data }),
  })
}

export async function purgeData(confirmText: string) {
  return request<{ ok: boolean }>('/api/purge', {
    method: 'DELETE',
    body: JSON.stringify({ confirmText }),
  })
}

export async function fetchLicenseStatus() {
  return request<LicenseStatus>('/api/license/status', { method: 'GET' })
}

export async function activateLicense(input: { code: string; deviceId: string; nickname?: string }) {
  return request<{ ok: boolean; activated: boolean; activatedAt: string; nickname: string }>(
    '/api/license/activate',
    {
      method: 'POST',
      body: JSON.stringify(input),
    },
  )
}

export async function fetchAutomationSettings() {
  return request<AutomationSettings>('/api/automation/settings', { method: 'GET' })
}

export async function saveAutomationSettings(input: AutomationSettings) {
  return request<{ ok: boolean; automationSettings: AutomationSettings }>('/api/automation/settings', {
    method: 'PUT',
    body: JSON.stringify(input),
  })
}

export async function fetchSessionsSnapshot() {
  const result = await request<{ conversations: Record<string, ConversationSnapshot> }>('/api/sessions', {
    method: 'GET',
  })
  return result.conversations
}

export async function fetchMomentsPosts() {
  const result = await request<{ posts: MomentPost[] }>('/api/moments/posts', { method: 'GET' })
  return result.posts
}

export async function createMomentPost(input: { roleId: string; content: string; images?: string[] }) {
  const result = await request<{ post: MomentPost }>('/api/moments/posts', {
    method: 'POST',
    body: JSON.stringify(input),
  })
  return result.post
}

export async function likeMomentPost(postId: string, likedByMe: boolean) {
  return request<{ ok: boolean; post: MomentPost }>(`/api/moments/posts/${postId}/like`, {
    method: 'POST',
    body: JSON.stringify({ likedByMe }),
  })
}

export async function commentMomentPost(postId: string, input: { roleId: string; content: string }) {
  return request<{ ok: boolean; post: MomentPost }>(`/api/moments/posts/${postId}/comments`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export async function fetchForumPosts(section?: 'recommend' | 'follow' | 'gossip') {
  const query = section ? `?section=${encodeURIComponent(section)}` : ''
  const result = await request<{ posts: ForumPost[] }>(`/api/forum/posts${query}`, { method: 'GET' })
  return result.posts
}

export async function createForumPost(input: {
  roleId: string
  title: string
  content: string
  section?: 'recommend' | 'follow' | 'gossip'
  tags?: string[]
}) {
  const result = await request<{ post: ForumPost }>('/api/forum/posts', {
    method: 'POST',
    body: JSON.stringify(input),
  })
  return result.post
}

export async function likeForumPost(postId: string, likedByMe: boolean) {
  return request<{ ok: boolean; post: ForumPost }>(`/api/forum/posts/${postId}/like`, {
    method: 'POST',
    body: JSON.stringify({ likedByMe }),
  })
}

export async function replyForumPost(postId: string, input: { roleId: string; content: string }) {
  return request<{ ok: boolean; post: ForumPost }>(`/api/forum/posts/${postId}/replies`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export async function fetchMusicState() {
  return request<MusicState>('/api/music/state', { method: 'GET' })
}

export async function addMusicTrack(input: { name: string; artist?: string; durationSec?: number }) {
  return request<{ ok: boolean; music: MusicState }>('/api/music/tracks', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export async function renameMusicTrack(trackId: string, name: string) {
  return request<{ ok: boolean; music: MusicState }>(`/api/music/tracks/${trackId}`, {
    method: 'PUT',
    body: JSON.stringify({ name }),
  })
}

export async function removeMusicTrack(trackId: string) {
  return request<{ ok: boolean; music: MusicState }>(`/api/music/tracks/${trackId}`, {
    method: 'DELETE',
  })
}

export async function setNowPlayingTrack(trackId: string) {
  return request<{ ok: boolean; music: MusicState }>('/api/music/now-playing', {
    method: 'PUT',
    body: JSON.stringify({ trackId }),
  })
}

export async function uploadMusicSongFile(input: {
  fileName: string
  mimeType: string
  size: number
  dataUrl: string
}) {
  return request<{ ok: boolean; music: MusicState; trackId: string; uploadedSongId: string }>('/api/music/upload/song', {
    method: 'POST',
    body: JSON.stringify(input),
    timeoutMs: 120000,
  })
}

export async function uploadMusicLyricsFile(input: {
  fileName: string
  size: number
  content: string
  linkedTrackId?: string
}) {
  return request<{ ok: boolean; music: MusicState; uploadedLyricsId: string }>('/api/music/upload/lyrics', {
    method: 'POST',
    body: JSON.stringify(input),
    timeoutMs: 120000,
  })
}
