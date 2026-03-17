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

export type LicenseStatus = {
  activated: boolean
  activatedAt: string
  nickname: string
}

export type AutomationSettings = {
  autoMessageEnabled: boolean
  autoMessageIntervalMinutes: number
  autoMessageRoleIds: string[]
  keepAliveEnabled: boolean
  autoSummaryEnabled: boolean
  autoSummaryRounds: number
  lastAutoMessageAt?: Record<string, string>
}

export type ConversationSnapshot = {
  sessionId: string
  roleId: string
  worldBookId: string
  messages: ChatMessage[]
  memory: MemorySnapshot
}

export type MomentComment = {
  id: string
  roleId: string
  roleName: string
  content: string
  createdAt: string
}

export type MomentPost = {
  id: string
  roleId: string
  roleName: string
  content: string
  images: string[]
  likes: number
  likedByMe: boolean
  createdAt: string
  comments: MomentComment[]
}

export type ForumReply = {
  id: string
  roleId: string
  roleName: string
  content: string
  createdAt: string
}

export type ForumPost = {
  id: string
  roleId: string
  roleName: string
  title: string
  content: string
  section: 'recommend' | 'follow' | 'gossip'
  tags: string[]
  likes: number
  likedByMe: boolean
  createdAt: string
  replies: ForumReply[]
}

export type MusicTrack = {
  id: string
  name: string
  artist: string
  durationSec: number
  addedAt: string
}

export type MusicSongFile = {
  id: string
  fileName: string
  mimeType: string
  size: number
  uploadedAt: string
  trackId: string
  dataUrl?: string
}

export type MusicLyricsFile = {
  id: string
  fileName: string
  size: number
  uploadedAt: string
  linkedTrackId: string
}

export type MusicRecentPlay = {
  trackId: string
  playedAt: string
}

export type MusicState = {
  nowPlayingTrackId: string
  playlist: MusicTrack[]
  uploadedSongs?: MusicSongFile[]
  uploadedLyrics?: MusicLyricsFile[]
  recentPlayed?: MusicRecentPlay[]
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
