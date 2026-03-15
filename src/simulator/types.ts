import type { ComponentType } from 'react'

export type AppRuntimeProps = {
  onExit: () => void
}

export type AppDefinition = {
  id: string
  name: string
  icon: string
  description: string
  component: ComponentType<AppRuntimeProps>
}
