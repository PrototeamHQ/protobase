import { useEffect, type RefObject } from 'react'
import { nativeBridgeOf, type NativeBridge } from '../app/native-auth-fetch'
import { statusBarStyleOver } from './brand-bar'

// A colour as the screen shows it, `rgb(r, g, b)`, whatever form the theme wrote it in: one pixel painted in it
const shown = (color: string) => {
  const context = document.createElement('canvas').getContext('2d', { willReadFrequently: true })
  if (!context) return color
  context.fillStyle = color
  context.fillRect(0, 0, 1, 1)
  const [r, g, b] = context.getImageData(0, 0, 1, 1).data
  return `rgb(${r}, ${g}, ${b})`
}

/**
 * While `on`, sets the status bar's text light or dark for the brand colour `probe` shows, through the app's SystemBars
 * plugin where its bridge has one, so it reads over a brand-coloured bar; back to the system's own once off.
 */
export const useBrandStatusBar = (on: boolean, probe: RefObject<HTMLElement | null>) => {
  useEffect(() => {
    const bridge: NativeBridge | undefined = nativeBridgeOf(window as { Capacitor?: NativeBridge })
    if (!on || !probe.current || !bridge?.isPluginAvailable('SystemBars')) return
    const style = statusBarStyleOver(shown(getComputedStyle(probe.current).backgroundColor))
    void bridge.nativePromise('SystemBars', 'setStyle', { style })
    return () => void bridge.nativePromise('SystemBars', 'setStyle', { style: 'DEFAULT' })
  }, [on, probe])
}
