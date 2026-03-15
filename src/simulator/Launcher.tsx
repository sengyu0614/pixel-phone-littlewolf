import { appRegistry } from './appsRegistry'
import { PixelIcon } from '../components/ui'
import { useSimulatorStore } from './store/simulatorStore'

export function Launcher() {
  const openApp = useSimulatorStore((state) => state.openApp)
  const openedAppIds = useSimulatorStore((state) => state.openedAppIds)

  return (
    <section className="launcher-grid">
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
