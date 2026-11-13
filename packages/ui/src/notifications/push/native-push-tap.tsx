import { useEffect, useRef, useState } from 'react'
import { pageKept } from '../../app/live-update/kept-page'
import type { NativeBridge } from '../../app/native-auth-fetch'
import { useRouter } from '../../app/router'
import { useAuth } from '../../auth/auth-provider'
import { guarded } from '../../lib/guarded'
import { pushPluginName } from './native-push'
import { nativeTapGate } from './native-tap-gate'
import { nativeTapTarget, type NativeTapTarget } from './native-tap'
import { reloadTap } from './reload-tap'

/** Protobase's native plugin that opens a url in the app the phone opens links with, never in the WebView. */
const externalPlugin = 'ProtobaseExternal'

/**
 * Opens a tapped push's target: a page of the app through the router, or a url outside the app through
 * ProtobaseExternal. Never a navigation of the WebView, which Capacitor would load inside the app for another port of
 * its own host; without the plugin, an outside url opens nothing.
 */
export const openNativeTap = async (target: NativeTapTarget, { bridge, navigate }: { bridge: NativeBridge; navigate: (to: string) => void }) => {
  if (target.kind === 'in-app') return navigate(target.path)
  if (!bridge.isPluginAvailable(externalPlugin)) return
  await bridge.nativePromise(externalPlugin, 'open', { url: target.url })
}

// The data the phone hands the app with a tap, `{ notification: { data } }`: FCM's data on Android, the whole APNs
// payload on iOS.
const tapData = (action: unknown) => (typeof action === 'object' && action !== null ? (action as { notification?: { data?: unknown } }).notification?.data : undefined)

/**
 * Listens for taps on a push in the iOS and Android app, warm or from a cold start, which the plugin keeps for this first
 * listener, and opens each once the sign-in is known, for the user signed in then (`nativeTapTarget`). A tap that
 * arrives while the app reloads into a live update is opened by the page it reloads into (`reloadTap`). Renders nothing.
 */
export const NativePushTap = ({ nativeBridge, apiOrigin }: { nativeBridge: NativeBridge; apiOrigin: string }) => {
  const { state } = useAuth()
  const { navigate, basePath } = useRouter()
  const userId = state.kind === 'signed-in' ? state.user.id : undefined
  const open = useRef<(data: unknown) => void>(() => {})
  open.current = (data) => {
    const target = nativeTapTarget(data, { apiOrigin, userId, basePath })
    if (target) void openNativeTap(target, { bridge: nativeBridge, navigate })
  }
  const [gate] = useState(() => nativeTapGate((data) => open.current(data)))
  const [carry] = useState(() => {
    const storage = guarded(() => window.sessionStorage, undefined)
    return storage && reloadTap({ storage, reloading: () => pageKept(storage) })
  })

  useEffect(() => gate.settle(state.kind !== 'loading'), [gate, state.kind, userId])

  useEffect(() => {
    if (!nativeBridge.isPluginAvailable(pushPluginName)) return
    carry?.resume(gate.tap)
    const listener = nativeBridge.addListener(pushPluginName, 'pushNotificationActionPerformed', (action) => (carry ? carry.receive(tapData(action), gate.tap) : gate.tap(tapData(action))))
    return () => void listener.remove()
  }, [nativeBridge, gate, carry])

  return null
}
