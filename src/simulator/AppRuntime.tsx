import { getRegisteredAppById } from './appsRegistry'
import { PixelButton, PixelWindow } from '../components/ui'
import type { AppDefinition } from './types'
import { useSimulatorStore } from './store/simulatorStore'

export function AppRuntime() {
  const activeAppId = useSimulatorStore((state) => state.activeAppId)
  const openedAppIds = useSimulatorStore((state) => state.openedAppIds)
  const switchApp = useSimulatorStore((state) => state.switchApp)
  const closeApp = useSimulatorStore((state) => state.closeApp)
  const goHome = useSimulatorStore((state) => state.goHome)
  const activeApp = activeAppId ? getRegisteredAppById(activeAppId) : undefined
  const openedApps: AppDefinition[] = openedAppIds.reduce<AppDefinition[]>((apps, appId) => {
    const app = getRegisteredAppById(appId)
    if (app) {
      apps.push(app)
    }
    return apps
  }, [])

  if (!activeApp) {
    return (
      <PixelWindow bodyClassName="p-4 text-sm text-pixel-text-muted">找不到应用：{activeAppId}</PixelWindow>
    )
  }

  const ActiveComponent = activeApp.component

  return (
    <section className="app-runtime">
      <header className="app-runtime-header">
        <div className="app-runtime-title">
          <p className="text-xs text-pixel-text-muted">RUNNING</p>
          <h2 className="text-sm text-pixel-text">{activeApp.name}</h2>
        </div>
        <div className="app-runtime-actions">
          <PixelButton onClick={goHome}>返回桌面</PixelButton>
          <PixelButton variant="danger" onClick={() => closeApp(activeApp.id)}>
            关闭应用
          </PixelButton>
        </div>
      </header>
      <div className="app-runtime-switcher">
        {openedApps.map((app) => (
          <PixelButton
            key={app.id}
            className={`app-switch-chip ${app.id === activeApp.id ? 'active' : ''}`}
            onClick={() => switchApp(app.id)}
          >
            {app.name}
          </PixelButton>
        ))}
      </div>
      <div className="app-runtime-body">
        <ActiveComponent onExit={() => closeApp(activeApp.id)} />
      </div>
    </section>
  )
}
