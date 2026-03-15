const BIP_ENABLED_KEY = 'pixel-phone-button-bip-enabled'

let buttonBipEnabled = true
let audioContext: AudioContext | null = null

function getAudioContext() {
  if (typeof window === 'undefined') {
    return null
  }
  if (audioContext) {
    return audioContext
  }
  const Context = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Context) {
    return null
  }
  audioContext = new Context()
  return audioContext
}

export function initializeButtonBipSetting() {
  if (typeof window === 'undefined') {
    return
  }
  const raw = window.localStorage.getItem(BIP_ENABLED_KEY)
  if (raw === '0') {
    buttonBipEnabled = false
  } else if (raw === '1') {
    buttonBipEnabled = true
  } else {
    buttonBipEnabled = true
    window.localStorage.setItem(BIP_ENABLED_KEY, '1')
  }
}

export function setButtonBipEnabled(enabled: boolean) {
  buttonBipEnabled = enabled
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(BIP_ENABLED_KEY, enabled ? '1' : '0')
  }
}

export function playButtonBip() {
  if (!buttonBipEnabled) {
    return
  }
  const ctx = getAudioContext()
  if (!ctx) {
    return
  }
  if (ctx.state === 'suspended') {
    void ctx.resume()
  }
  const oscillator = ctx.createOscillator()
  const gainNode = ctx.createGain()
  const startAt = ctx.currentTime
  const endAt = startAt + 0.06

  oscillator.type = 'square'
  oscillator.frequency.setValueAtTime(988, startAt)

  gainNode.gain.setValueAtTime(0.001, startAt)
  gainNode.gain.exponentialRampToValueAtTime(0.08, startAt + 0.005)
  gainNode.gain.exponentialRampToValueAtTime(0.0001, endAt)

  oscillator.connect(gainNode)
  gainNode.connect(ctx.destination)
  oscillator.start(startAt)
  oscillator.stop(endAt)
}
