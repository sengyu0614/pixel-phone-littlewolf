import type {
  AIConfigInput,
  AIConfigPublic,
  ChatUiSettings,
  ChatResponse,
  RoleProfile,
  UserPersonaMemory,
  WorldBook,
} from './types'
import { UnifiedApiError } from './types'

const API_BASE =
  import.meta.env.VITE_API_BASE_URL ?? (import.meta.env.PROD ? '' : 'http://localhost:8787')

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
