export type ChatRole = 'system' | 'user' | 'assistant'

export type ChatMessage = {
  role: ChatRole
  content: string
  timestamp: string
}

export type RoleSampleDialogue = {
  user: string
  assistant: string
}

export type RoleProfile = {
  id: string
  name: string
  avatar: string
  description: string
  worldBookId?: string
  persona: {
    identity: string
    relationship: string
    speakingStyle: string
    values: string
    boundaries: string
    worldview: string
    sampleDialogues: RoleSampleDialogue[]
  }
  createdAt: string
  updatedAt: string
}

export type WorldBook = {
  id: string
  name: string
  content: string
  createdAt: string
  updatedAt: string
}

export type AIConfigInput = {
  baseUrl: string
  model: string
  apiKey: string
  headers?: Record<string, string>
}

export type AIConfigPublic = {
  baseUrl: string
  model: string
  headers?: Record<string, string>
  hasApiKey: boolean
  maskedApiKey: string
}

export type TimestampStyle = 'bubble' | 'avatar' | 'hidden'
export type ReadReceiptStyle = 'bubble' | 'avatar' | 'hidden'
export type HideAvatarMode = 'none' | 'both' | 'friend' | 'me'

export type ChatUiSettings = {
  showTimestamp: boolean
  showSeconds: boolean
  timestampStyle: TimestampStyle
  showReadReceipt: boolean
  readReceiptStyle: ReadReceiptStyle
  hideAvatarMode: HideAvatarMode
  myBubbleColor: string
  friendBubbleColor: string
  buttonBipEnabled: boolean
}

export type MemorySnapshot = {
  summary: string
  facts: string[]
}

export type UserPersonaMemory = {
  readableMemory: string
  privateMemory: string
  allowPrivateForAI: boolean
}

export type ChatResponse = {
  reply: string
  role: RoleProfile
  sessionId: string
  sessionWorldBookId?: string
  memory: MemorySnapshot
  conversation: ChatMessage[]
}

export class UnifiedApiError extends Error {
  code: string
  status: number

  constructor(code: string, status: number, message: string) {
    super(message)
    this.name = 'UnifiedApiError'
    this.code = code
    this.status = status
  }
}
