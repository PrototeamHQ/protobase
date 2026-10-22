import { createHash } from 'node:crypto'

/**
 * Names the app's native code: the native packages @protobase/mobile pins, name → version (`pinnedNative`), and the
 * project's `mobile.plugins`, name → the spec it gives. A release of the app's files runs only on a binary of the same
 * fingerprint. It holds no Protobase version, so a Protobase release that pins the same native packages keeps
 * binaries on live updates. A plugin's spec counts, not the version npm installed: its floor is what the app's files
 * need of it, so raise the floor when they start using a newer native feature, which changes the fingerprint.
 */
export const nativeFingerprint = (pinned: Record<string, string>, plugins: Record<string, string> = {}) => {
  const entries = Object.entries({ ...pinned, ...plugins }).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  return createHash('sha256').update(JSON.stringify(entries)).digest('hex').slice(0, 16)
}
