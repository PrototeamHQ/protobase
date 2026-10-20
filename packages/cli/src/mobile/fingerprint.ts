import { createHash } from 'node:crypto'

export type NativeParts = {
  /** The version of @protobase/mobile, which pins Capacitor and its plugins. */
  mobile: string
  /** The extra plugins as installed: `[name, version]`. */
  plugins: Array<[string, string]>
}

/** Names the app's native code: the same for two builds only when they compile in the same native packages. */
export const nativeFingerprint = ({ mobile, plugins }: NativeParts) => {
  const sorted = [...plugins].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  return createHash('sha256').update(JSON.stringify({ mobile, plugins: sorted })).digest('hex').slice(0, 16)
}
