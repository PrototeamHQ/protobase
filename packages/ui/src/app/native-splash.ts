import type { NativeBridge } from './native-auth-fetch'

const splashPlugin = 'SplashScreen'

export type NativeSplash = { show: () => Promise<unknown>; hide: () => Promise<unknown> }

/**
 * Capacitor's splash screen in the iOS or Android app, which covers the app from launch until the shell has drawn and
 * while it reloads into a release, staying until `hide()`; `undefined` in a browser and in a binary without it. A
 * binary that holds it takes only releases that hide it, as its native fingerprint names that contract.
 */
export const nativeSplash = (bridge: NativeBridge | undefined): NativeSplash | undefined => {
  if (!bridge?.isPluginAvailable(splashPlugin)) return
  return {
    show: () => bridge.nativePromise(splashPlugin, 'show', { autoHide: false }),
    hide: () => bridge.nativePromise(splashPlugin, 'hide', {}),
  }
}
