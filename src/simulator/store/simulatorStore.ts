import { create } from 'zustand'
import { isRegisteredApp } from '../appsRegistry'

export type AIProvider = 'claude' | 'gemini'

type SimulatorState = {
  activeAppId: string | null
  openedAppIds: string[]
  currentProvider: AIProvider
  modelByProvider: Record<AIProvider, string>
  openApp: (appId: string) => void
  switchApp: (appId: string) => void
  closeApp: (appId: string) => void
  goHome: () => void
  setProvider: (provider: AIProvider) => void
  setModelForProvider: (provider: AIProvider, model: string) => void
}

const defaultModels: Record<AIProvider, string> = {
  claude: 'claude-3-5-sonnet-latest',
  gemini: 'gemini-1.5-flash',
}

export const useSimulatorStore = create<SimulatorState>((set) => ({
  activeAppId: null,
  openedAppIds: [],
  currentProvider: 'claude',
  modelByProvider: defaultModels,
  openApp: (appId) =>
    set((state) => {
      if (!isRegisteredApp(appId)) {
        return state
      }

      if (state.openedAppIds.includes(appId)) {
        return { activeAppId: appId }
      }

      return {
        activeAppId: appId,
        openedAppIds: [...state.openedAppIds, appId],
      }
    }),
  switchApp: (appId) =>
    set((state) => {
      if (!state.openedAppIds.includes(appId)) {
        return state
      }
      return { activeAppId: appId }
    }),
  closeApp: (appId) =>
    set((state) => {
      const openedAppIds = state.openedAppIds.filter((id) => id !== appId)
      if (state.activeAppId !== appId) {
        return { openedAppIds }
      }
      const nextActiveAppId = openedAppIds.at(-1) ?? null
      return {
        openedAppIds,
        activeAppId: nextActiveAppId,
      }
    }),
  goHome: () => set({ activeAppId: null }),
  setProvider: (provider) => set({ currentProvider: provider }),
  setModelForProvider: (provider, model) =>
    set((state) => ({
      modelByProvider: {
        ...state.modelByProvider,
        [provider]: model,
      },
    })),
}))
