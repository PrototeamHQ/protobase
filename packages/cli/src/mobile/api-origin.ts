import type { Platform } from './platform'

const loopback = ['localhost', '127.0.0.1']

// The hosts plain http may reach: this machine, and on Android the emulator's host. `adb reverse` forwards only IPv4,
// so Android's own `[::1]` would be the device's.
const httpHosts: Record<Platform, string[]> = { ios: [...loopback, '[::1]'], android: [...loopback, '10.0.2.2'] }

/**
 * The server the app calls: `--api` when given, else the app's URL (`url`, `PROTOBASE_URL`), its tokens' issuer. It must be an http or https origin
 * with nothing after it; plain http only to this machine, or the Android emulator's host, since anyone on the network
 * between could read or change what it sends.
 */
export const apiUrl = (given: string | undefined, issuer: string | undefined, platform: Platform) => {
  const value = given ?? issuer
  const what = given === undefined ? `The app's URL (url or PROTOBASE_URL) "${value}"` : `--api ${given}`
  if (value === undefined) throw new Error('This project has no url (PROTOBASE_URL) for the app to call: set it, or pass --api https://…')
  if (!URL.canParse(value)) throw new Error(`${what} is not a URL such as https://shop.example.com`)
  const url = new URL(value)
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error(`${what} must be an http or https URL`)
  if (url.username || url.password || url.pathname !== '/' || url.search || url.hash || value.endsWith('?') || value.endsWith('#')) {
    throw new Error(`${what} must be an origin such as https://shop.example.com, without a user, path, query or fragment`)
  }
  if (url.protocol === 'http:' && !httpHosts[platform].includes(url.hostname)) {
    throw new Error(`${what} uses plain http to ${url.hostname}: plain http is only for a server on this machine (${httpHosts[platform].join(', ')}); any other server needs https`)
  }
  return url
}

/** What the app must allow to reach `url`: plain http, and on Android mixed content for a host that is not loopback. */
export const httpAllowances = (url: URL) => ({ cleartext: url.protocol === 'http:', mixedContent: url.hostname === '10.0.2.2' })

export type HttpAllowances = ReturnType<typeof httpAllowances>

/** The port `adb reverse` forwards for an Android app calling `url` on this machine, `undefined` for any other. */
export const forwardedPort = (url: URL, platform: Platform) => {
  if (platform !== 'android' || !loopback.includes(url.hostname)) return undefined
  return Number(url.port || (url.protocol === 'https:' ? 443 : 80))
}

// Hosts that name the machine the app runs on, or the emulator's host: a store release calling one reaches no server.
const isLocalHost = (hostname: string) =>
  hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.startsWith('127.') || hostname === '[::1]' || hostname === '0.0.0.0' || hostname === '10.0.2.2'

/**
 * Throws unless a release may call `url`: https to a server that is not this machine, so the app allows no plain http
 * and no mixed content, which anyone between could read or change.
 */
export const checkReleaseUrl = (url: URL) => {
  const { cleartext, mixedContent } = httpAllowances(url)
  if (cleartext || mixedContent || url.protocol !== 'https:' || isLocalHost(url.hostname)) {
    throw new Error(`A release build calls its server over https, since anyone between could read or change plain http, and not ${url.origin} on this machine: pass --api https://… or give the app an https url (PROTOBASE_URL)`)
  }
}
