import type { NativeBridge } from '../../app/native-auth-fetch'
import { pushPluginName, type NativeDevice } from './native-push'

/** Protobase's iOS plugin that names what the app registers its APNs token with. */
export const apnsPluginName = 'ProtobasePush'

type ApnsTarget = { appId: string; environment: 'sandbox' | 'production' }

/**
 * What the app's push token registers as, or `undefined` where the app has no native push: an `fcm` device in the
 * Android app whose build compiled the push plugin in, which it does only with the project's Firebase file; an `apns`
 * device in the iOS app whose build compiled it in with ProtobasePush, with the token as lowercase hex, as the server
 * takes it, the bundle id and the APNs environment the build's entitlement names.
 */
export const nativeDevice = (bridge: NativeBridge): ((token: string) => Promise<NativeDevice>) | undefined => {
  if (!bridge.isPluginAvailable(pushPluginName)) return
  const platform = bridge.getPlatform()
  if (platform === 'android') return async (token) => ({ kind: 'fcm', token })
  if (platform !== 'ios' || !bridge.isPluginAvailable(apnsPluginName)) return
  return async (token) => {
    const { appId, environment } = (await bridge.nativePromise(apnsPluginName, 'apns', {})) as ApnsTarget
    return { kind: 'apns', token: token.toLowerCase(), appId, environment }
  }
}
