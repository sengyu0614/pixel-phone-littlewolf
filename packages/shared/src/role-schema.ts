export type RoleSampleDialogue = {
  user: string
  assistant: string
}

export type RolePersona = {
  identity: string
  relationship: string
  speakingStyle: string
  values: string
  boundaries: string
  worldview: string
  sampleDialogues: RoleSampleDialogue[]
}

export type RoleProfile = {
  id: string
  name: string
  avatar: string
  description: string
  worldBookId?: string
  persona: RolePersona
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

export type RoleUpsertInput = {
  name: string
  avatar: string
  description: string
  worldBookId?: string
  persona: RolePersona
}
