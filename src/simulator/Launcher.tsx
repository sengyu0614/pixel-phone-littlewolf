import { appRegistry } from './appsRegistry'
import { PixelIcon } from '../components/ui'
import { useSimulatorStore } from './store/simulatorStore'

type LauncherProps = {
  modernHome?: boolean
}

export function Launcher({ modernHome = false }: LauncherProps) {
  const openApp = useSimulatorStore((state) => state.openApp)
  const openedAppIds = useSimulatorStore((state) => state.openedAppIds)

  return (
    <section className={`launcher-grid ${modernHome ? 'launcher-grid-modern' : ''}`}>
      {appRegistry.map((app) => (
        <PixelIcon
          key={app.id}
          glyph={app.icon}
          label={app.name}
          onClick={() => openApp(app.id)}
          aria-label={`打开 ${app.name}`}
          title={app.description}
          meta={openedAppIds.includes(app.id) ? '已打开' : undefined}
        />
      ))}
    </section>
  )
}
