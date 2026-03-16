export type UiFeatureFlagKey = 'newHomeUI' | 'newChatUI' | 'newSettingsUI'

export type UiFeatureFlags = Record<UiFeatureFlagKey, boolean>

const STORAGE_KEY = 'pixel-phone-ui-flags-v1'

const defaultUiFlags: UiFeatureFlags = {
  newHomeUI: true,
  newChatUI: true,
  newSettingsUI: true,
}

function normalizeBooleanFlag(value: unknown, fallback: boolean) {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (['1', 'true', 'on', 'yes'].includes(normalized)) return true
    if (['0', 'false', 'off', 'no'].includes(normalized)) return false
  }
  return fallback
}

export function loadUiFeatureFlags(): UiFeatureFlags {
  if (typeof window === 'undefined') {
    return { ...defaultUiFlags }
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return { ...defaultUiFlags }
    }
    const parsed = JSON.parse(raw) as Partial<UiFeatureFlags>
    return {
      newHomeUI: normalizeBooleanFlag(parsed.newHomeUI, defaultUiFlags.newHomeUI),
      newChatUI: normalizeBooleanFlag(parsed.newChatUI, defaultUiFlags.newChatUI),
      newSettingsUI: normalizeBooleanFlag(parsed.newSettingsUI, defaultUiFlags.newSettingsUI),
    }
  } catch {
    return { ...defaultUiFlags }
  }
}

export function saveUiFeatureFlags(flags: UiFeatureFlags) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(flags))
}

export function resolveUiFeatureFlags(): UiFeatureFlags {
  const merged = loadUiFeatureFlags()
  if (typeof window === 'undefined') return merged

  const params = new URLSearchParams(window.location.search)
  ;(['newHomeUI', 'newChatUI', 'newSettingsUI'] as UiFeatureFlagKey[]).forEach((key) => {
    if (!params.has(key)) return
    merged[key] = normalizeBooleanFlag(params.get(key), merged[key])
  })
  return merged
}
