import type { NativeBridge } from './native-auth-fetch'

/**
 * Gives the iOS app's keyboard back the bar above it, with the arrows to the previous and next field and Done, which
 * Capacitor's keyboard plugin hides when it loads and has no setting for. A binary built before it had the plugin,
 * and Android, which has no such bar, are left as they are.
 */
export const showKeyboardAccessoryBar = async (bridge: NativeBridge) => {
  if (bridge.getPlatform() !== 'ios' || !bridge.isPluginAvailable('Keyboard')) return
  await bridge.nativePromise('Keyboard', 'setAccessoryBarVisible', { isVisible: true })
}
