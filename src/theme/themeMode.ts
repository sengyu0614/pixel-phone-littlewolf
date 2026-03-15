export type ThemeMode = 'light' | 'night'

export const THEME_MODE_EVENT = 'pixel-theme-mode-change'
const LOCAL_THEME_STORAGE_KEY = 'pixel-chat-local-theme'

function isThemeMode(value: unknown): value is ThemeMode {
  return value === 'light' || value === 'night'
}

export function resolveThemeModeFromStorage(): ThemeMode {
  if (typeof window === 'undefined') return 'light'
  try {
    const raw = window.localStorage.getItem(LOCAL_THEME_STORAGE_KEY)
    if (!raw) return 'light'
    const parsed = JSON.parse(raw) as { nightMode?: boolean }
    return parsed.nightMode ? 'night' : 'light'
  } catch {
    return 'light'
  }
}

export function applyThemeMode(mode: ThemeMode) {
  if (typeof document === 'undefined') return
  document.documentElement.setAttribute('data-pixel-theme', mode)
  window.dispatchEvent(
    new CustomEvent(THEME_MODE_EVENT, {
      detail: { mode },
    }),
  )
}

export function normalizeThemeMode(value: unknown, fallback: ThemeMode = 'light'): ThemeMode {
  return isThemeMode(value) ? value : fallback
}
