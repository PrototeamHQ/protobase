import { mobileReleasesPath } from '@protobase/schema/internal'
import { formatReleaseOrder } from '@protobase/server/mobile-release'
import { updaterPublicKey } from './public-key'

/** What the live updater's guard is given beyond the binary's fingerprint and shell version. */
export type LiveUpdateSettings = { publicKey: string; builtInOrder: string; releasesUrl: string }

export type LiveUpdateInput = {
  /** `mobile.publicKey`, checked. */
  publicKey?: string
  /** The order of the app's own files, `undefined` when their bundle names no build time. */
  builtInOrder?: number[]
  apiOrigin: string
  /** With `--live` the app opens protobase dev, which serves no release. */
  live: boolean
}

const loopback = ['localhost', '127.0.0.1', '[::1]']

// Where no one on the network path can answer for the server: https, or http to the device itself, as the guard allows.
const ownOrigin = (origin: string) => {
  const url = new URL(origin)
  return url.protocol === 'https:' || (url.protocol === 'http:' && loopback.includes(url.hostname))
}

/**
 * Whether the app gets the live updater, on Android and iOS alike: with `mobile.publicKey`, the order of its own files and an
 * API origin it may take releases from, never with `--live`. `note` says why not, when the project could change it.
 */
export const liveUpdateSettings = ({ publicKey, builtInOrder, apiOrigin, live }: LiveUpdateInput): { settings?: LiveUpdateSettings; note?: string } => {
  if (live) return {}
  if (publicKey === undefined) return { note: 'the app does not update itself: set mobile.publicKey to the public key protobase mobile keys prints' }
  if (!builtInOrder) return { note: "the app does not update itself: its files name no build time, so it could not refuse a release older than them" }
  if (!ownOrigin(apiOrigin)) return { note: `the app does not update itself: it takes releases over https only, or http to this device, not from ${apiOrigin}` }
  return { settings: { publicKey: updaterPublicKey(publicKey), builtInOrder: formatReleaseOrder(builtInOrder), releasesUrl: `${apiOrigin}${mobileReleasesPath}` } }
}
