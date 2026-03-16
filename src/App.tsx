import { useEffect } from 'react'
import { PhoneShell } from './simulator/PhoneShell'
import { ActivationGate } from './components/ActivationGate'
import { initializeButtonBipSetting, playButtonBip } from './platform/soundEffects'

function App() {
  useEffect(() => {
    initializeButtonBipSetting()
    const onClick = (event: MouseEvent) => {
      const target = event.target
      if (!(target instanceof Element)) {
        return
      }
      const button = target.closest('button')
      if (!button || button.disabled) {
        return
      }
      playButtonBip()
    }
    document.addEventListener('click', onClick, true)
    return () => {
      document.removeEventListener('click', onClick, true)
    }
  }, [])

  return (
    <ActivationGate>
      <main className="simulator-page">
        <PhoneShell />
      </main>
    </ActivationGate>
  )
}

export default App
