import { createHash } from 'node:crypto'

// A colon is in no npm name, so no plugin takes this entry.
const pushEntry = 'protobase:push'

/**
 * Names the app's native code: what @protobase/mobile carries, name → version (`pinnedNative`: the native packages it
 * pins and its own native contract), and the project's `mobile.plugins`, name → the spec it gives. A release of the
 * app's files runs only on a binary of the same fingerprint. It holds no Protobase version, so a Protobase release that
 * pins the same native packages and native contract keeps binaries on live updates. A plugin's spec counts, not the
 * version npm installed: its floor is what the app's files need of it, so raise the floor when they start using a
 * newer native feature, which changes the fingerprint. With `push`, the app's `notifications()`, the app compiles
 * native push in, which an entry no npm name can take names.
 */
export const nativeFingerprint = (pinned: Record<string, string>, plugins: Record<string, string> = {}, { push = false }: { push?: boolean } = {}) => {
  const entries = Object.entries({ ...pinned, ...plugins, ...(push && { [pushEntry]: 'native' }) }).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  return createHash('sha256').update(JSON.stringify(entries)).digest('hex').slice(0, 16)
}
