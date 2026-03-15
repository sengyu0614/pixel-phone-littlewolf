export type PlatformBridge = {
  name: 'web' | 'desktop' | 'mobile'
  vibrate: (duration: number) => void
}

export const webPlatformBridge: PlatformBridge = {
  name: 'web',
  vibrate: (duration) => {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(duration)
    }
  },
}
