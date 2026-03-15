import type { ChatMessage } from '../api/types'

export const ROLE_SCHEMA_VERSION = '1.0.0'

export type RoleCoreIdentity = {
  id: string
  name: string
  alias?: string
  age?: string
  occupation?: string
  background?: string
}

export type RoleRelationship = {
  userTitle: string
  closeness: number
  relationshipNotes: string
}

export type RoleSpeechStyle = {
  tone: string
  pacing: 'slow' | 'normal' | 'fast'
  vocabularyLevel: 'simple' | 'neutral' | 'literary'
  catchphrases: string[]
}

export type RoleValueBoundary = {
  values: string[]
  tabooTopics: string[]
  hardRules: string[]
  refusalStyle: string
}

export type RoleWorldview = {
  setting?: string
  timeline?: string
  coreBeliefs: string[]
  extraContext?: string
}

export type RoleDialogueExample = {
  user: string
  assistant: string
}

export type RolePersonaProfile = {
  schemaVersion: typeof ROLE_SCHEMA_VERSION
  identity: RoleCoreIdentity
  relationship: RoleRelationship
  speechStyle: RoleSpeechStyle
  valueBoundary: RoleValueBoundary
  worldview: RoleWorldview
  dialogueExamples: RoleDialogueExample[]
}

export type LongTermMemoryFact = {
  key: string
  value: string
  confidence: number
  source: 'user' | 'assistant' | 'system'
  updatedAt: string
}

export type ConversationSummaryMemory = {
  summary: string
  highlights: string[]
  mood: string
  updatedAt: string
}

export type ShortTermMemory = {
  maxMessages: number
  messages: ChatMessage[]
}

export type RoleMemoryState = {
  schemaVersion: typeof ROLE_SCHEMA_VERSION
  roleId: string
  sessionId: string
  shortTerm: ShortTermMemory
  summaries: ConversationSummaryMemory[]
  keyFacts: LongTermMemoryFact[]
}

export type RoleConversationSnapshot = {
  role: RolePersonaProfile
  memory: RoleMemoryState
}

export function createDefaultRolePersonaProfile(name = '未命名角色'): RolePersonaProfile {
  return {
    schemaVersion: ROLE_SCHEMA_VERSION,
    identity: {
      id: crypto.randomUUID(),
      name,
    },
    relationship: {
      userTitle: '你',
      closeness: 0.5,
      relationshipNotes: '',
    },
    speechStyle: {
      tone: '温和',
      pacing: 'normal',
      vocabularyLevel: 'neutral',
      catchphrases: [],
    },
    valueBoundary: {
      values: [],
      tabooTopics: [],
      hardRules: [],
      refusalStyle: '礼貌拒绝并解释原因',
    },
    worldview: {
      coreBeliefs: [],
    },
    dialogueExamples: [],
  }
}

export function createDefaultRoleMemoryState(roleId: string, sessionId: string): RoleMemoryState {
  return {
    schemaVersion: ROLE_SCHEMA_VERSION,
    roleId,
    sessionId,
    shortTerm: {
      maxMessages: 20,
      messages: [],
    },
    summaries: [],
    keyFacts: [],
  }
}
