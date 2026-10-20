import type { Platform } from './platform'

const loopback = ['localhost', '127.0.0.1']

// The hosts plain http may reach: this machine, and on Android the emulator's host. `adb reverse` forwards only IPv4,
// so Android's own `[::1]` would be the device's.
const httpHosts: Record<Platform, string[]> = { ios: [...loopback, '[::1]'], android: [...loopback, '10.0.2.2'] }

/**
 * The server the app calls: `--api` when given, else the auth issuer (`baseURL`). It must be an http or https origin
 * with nothing after it; plain http only to this machine, or the Android emulator's host, since anyone on the network
 * between could read or change what it sends.
 */
export const apiUrl = (given: string | undefined, issuer: string | undefined, platform: Platform) => {
  const value = given ?? issuer
  const what = given === undefined ? `The auth issuer (baseURL) "${value}"` : `--api ${given}`
  if (value === undefined) throw new Error('This project has no auth issuer (baseURL) for the app to call: pass --api https://…')
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
