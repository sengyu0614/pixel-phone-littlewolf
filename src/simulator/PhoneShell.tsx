import { useEffect, useMemo, useState } from 'react'
import { AppRuntime } from './AppRuntime'
import { Launcher } from './Launcher'
import { useSimulatorStore } from './store/simulatorStore'
import { resolveUiFeatureFlags } from '../theme/featureFlags'
import {
  THEME_MODE_EVENT,
  applyThemeMode,
  normalizeThemeMode,
  resolveThemeModeFromStorage,
} from '../theme/themeMode'

function getNowTime() {
  const now = new Date()
  return now.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

function getNowDate() {
  const now = new Date()
  return now.toLocaleDateString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  })
}

export function PhoneShell() {
  const activeAppId = useSimulatorStore((state) => state.activeAppId)
  const time = useMemo(() => getNowTime(), [])
  const dateLabel = useMemo(() => getNowDate(), [])
  const uiFlags = useMemo(() => resolveUiFeatureFlags(), [])
  const [themeMode, setThemeMode] = useState(resolveThemeModeFromStorage())

  useEffect(() => {
    applyThemeMode(themeMode)
  }, [themeMode])

  useEffect(() => {
    const syncThemeMode = () => {
      setThemeMode(resolveThemeModeFromStorage())
    }
    const onThemeModeChanged = (event: Event) => {
      const customEvent = event as CustomEvent<{ mode?: string }>
      setThemeMode((prev) => normalizeThemeMode(customEvent.detail?.mode, prev))
    }
    window.addEventListener('storage', syncThemeMode)
    window.addEventListener(THEME_MODE_EVENT, onThemeModeChanged as EventListener)
    return () => {
      window.removeEventListener('storage', syncThemeMode)
      window.removeEventListener(THEME_MODE_EVENT, onThemeModeChanged as EventListener)
    }
  }, [])

  return (
    <div className={`phone-frame theme-${themeMode} ${uiFlags.newHomeUI ? 'ui-home-modern' : ''}`}>
      <div className="phone-notch" />

      <section className="phone-screen">
        <header className="status-bar">
          <div className="status-main">
            <strong>{time}</strong>
            {uiFlags.newHomeUI ? <small>{dateLabel}</small> : null}
          </div>
          <span className="status-icons">{uiFlags.newHomeUI ? '5G ▂▄▆█ 98%' : '4G ▂▄▆█ 95%'}</span>
        </header>

        <main className={`screen-body ${uiFlags.newHomeUI ? 'screen-body-modern' : ''}`}>
          {activeAppId ? <AppRuntime modernHome={uiFlags.newHomeUI} /> : <Launcher modernHome={uiFlags.newHomeUI} />}
        </main>
      </section>
    </div>
  )
}
