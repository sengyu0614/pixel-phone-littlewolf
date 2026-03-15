import { useMemo } from 'react'
import { AppRuntime } from './AppRuntime'
import { Launcher } from './Launcher'
import { useSimulatorStore } from './store/simulatorStore'

function getNowTime() {
  const now = new Date()
  return now.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

export function PhoneShell() {
  const activeAppId = useSimulatorStore((state) => state.activeAppId)
  const time = useMemo(() => getNowTime(), [])

  return (
    <div className="phone-frame">
      <div className="phone-notch" />

      <section className="phone-screen">
        <header className="status-bar">
          <span>{time}</span>
          <span className="status-icons">4G ▂▄▆█ 95%</span>
        </header>

        <main className="screen-body">
          {activeAppId ? <AppRuntime /> : <Launcher />}
        </main>
      </section>
    </div>
  )
}
