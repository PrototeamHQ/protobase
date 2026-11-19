import type { NativeBridge } from '../app/native-auth-fetch'

/** The plugin that signs the iOS or Android app in through native HTTP (`nativeAuthFetch`). */
export const nativeSignInPlugin = 'ProtobaseAuth'

/**
 * The native bridge to sign in through, when the binary offers ProtobaseAuth; `undefined` in a browser and in a host
 * that leaves it out, which keeps the session itself, such as one that serves the shell from its own scheme: the
 * page's own requests then carry the session.
 */
export const nativeSignInBridge = (bridge: NativeBridge | undefined) => (bridge?.isPluginAvailable(nativeSignInPlugin) ? bridge : undefined)
