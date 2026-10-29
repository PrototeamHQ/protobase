import { mobileReleasesPath } from '@protobase/schema/internal'
import { protobaseVersion } from '../../plugins/plugin-api'
import type { NativeBridge } from '../native-auth-fetch'
import { createLiveUpdater } from './live-updater'
import { nativeFingerprintOf } from './native-fingerprint'
import { checkRelease } from './release-check'

export type AppLiveUpdaterInput = {
  bridge: NativeBridge | undefined
  /** The origin of the API the app calls, which serves its releases. */
  apiOrigin: string | undefined
  userAgent: string
  fetch: typeof globalThis.fetch
  onHold: (holding: boolean) => void
}

/**
 * The live updater of the app the page runs in: `undefined` in a browser, and in an iOS or Android binary without the
 * live updater, such as one built without `mobile.publicKey`. It asks the server only with the binary's fingerprint
 * and the API origin the page names; without them it only tells the plugin the files started.
 */
export const appLiveUpdater = ({ bridge, apiOrigin, userAgent, fetch, onHold }: AppLiveUpdaterInput) => {
  if (!bridge?.Exception || !bridge.isPluginAvailable('LiveUpdate')) return
  const fingerprint = nativeFingerprintOf(userAgent)
  const check = async () => (fingerprint && apiOrigin ? checkRelease(fetch, { apiOrigin, fingerprint, shellVersion: protobaseVersion }) : undefined)
  return createLiveUpdater({ bridge: { nativePromise: bridge.nativePromise.bind(bridge), Exception: bridge.Exception }, check, releasesUrl: `${apiOrigin}${mobileReleasesPath}`, onHold })
}
