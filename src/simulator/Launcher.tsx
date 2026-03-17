import { appRegistry } from './appsRegistry'
import { PixelIcon } from '../components/ui'
import { useSimulatorStore } from './store/simulatorStore'

type LauncherProps = {
  modernHome?: boolean
}

const temporarilyClosedAppIds = new Set<string>(['role-moments', 'role-forum'])

export function Launcher({ modernHome = false }: LauncherProps) {
  const openApp = useSimulatorStore((state) => state.openApp)
  const openedAppIds = useSimulatorStore((state) => state.openedAppIds)
  const visibleApps = [...appRegistry].sort((a, b) => {
    const aClosed = temporarilyClosedAppIds.has(a.id)
    const bClosed = temporarilyClosedAppIds.has(b.id)
    if (aClosed === bClosed) return 0
    return aClosed ? 1 : -1
  })

  return (
    <section className={`launcher-grid ${modernHome ? 'launcher-grid-modern' : ''}`}>
      {visibleApps.map((app) => {
        const isClosed = temporarilyClosedAppIds.has(app.id)
        return (
          <PixelIcon
            key={app.id}
            glyph={app.icon}
            label={app.name}
            onClick={() => {
              if (!isClosed) {
                openApp(app.id)
              }
            }}
            aria-label={isClosed ? `${app.name} 暂不开放` : `打开 ${app.name}`}
            title={isClosed ? '暂不开放，后续开启' : app.description}
            disabled={isClosed}
            className={isClosed ? 'is-closed' : undefined}
            meta={isClosed ? '暂不开放' : openedAppIds.includes(app.id) ? '已打开' : undefined}
          />
        )
      })}
    </section>
  )
}
