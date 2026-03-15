import type { RoleProfile } from './role-schema'

export type ChatRole = 'system' | 'user' | 'assistant'

export type ChatMessage = {
  role: ChatRole
  content: string
  timestamp: string
}

export type MemorySnapshot = {
  summary: string
  facts: string[]
}

export type ConversationState = {
  sessionId: string
  roleId: string
  worldBookId?: string
  messages: ChatMessage[]
  memory: MemorySnapshot
}

export type AIConfigInput = {
  baseUrl: string
  apiKey: string
  model: string
  headers?: Record<string, string>
}

export type AIConfigPublic = Omit<AIConfigInput, 'apiKey'> & {
  hasApiKey: boolean
  maskedApiKey: string
}

export type ChatRequest = {
  roleId: string
  sessionId: string
  message: string
}

export type ChatResponse = {
  reply: string
  role: RoleProfile
  sessionId: string
  sessionWorldBookId?: string
  memory: MemorySnapshot
  conversation: ChatMessage[]
}
