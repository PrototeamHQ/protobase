import { getIP } from 'better-auth/api'

const windowMs = 60_000

/**
 * The client a request counts against, as Better Auth's sign-in limit reads it: an `X-Forwarded-For` of one valid
 * address (IPv6 by its /64), which `protobase serve` sets from the connection and its trusted proxies, or `unknown`,
 * one bucket for every request without one (several addresses included, since the leftmost is whatever the client
 * sent). In development and tests a request without one is `127.0.0.1`.
 */
export const clientAddress = (headers: Headers) => getIP(headers, {}) ?? 'unknown'

/**
 * At most `perMinute` takes per key in a fixed window of a minute, kept in this process. Keys whose window has passed are
 * dropped as new ones come, so memory follows the clients of the last minute.
 */
export const createRateLimit = ({ now = Date.now }: { now?: () => number } = {}) => {
  const windows = new Map<string, { start: number; count: number }>()

  const prune = (at: number) => {
    for (const [key, window] of windows) if (at - window.start >= windowMs) windows.delete(key)
  }

  /** Counts a take for `key`: `0` when allowed, else the seconds until its window lets it through again. */
  const take = (key: string, perMinute: number) => {
    const at = now()
    const current = windows.get(key)
    if (!current || at - current.start >= windowMs) {
      prune(at)
      windows.set(key, { start: at, count: 1 })
      return 0
    }
    if (current.count >= perMinute) return Math.ceil((current.start + windowMs - at) / 1000)
    current.count += 1
    return 0
  }

  return { take }
}

export type RateLimit = ReturnType<typeof createRateLimit>
