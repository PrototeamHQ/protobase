import { getIP } from 'better-auth/api'

const windowMs = 60_000

/**
 * The client a request counts against, as Better Auth's sign-in limit reads it: an `X-Forwarded-For` of one valid
 * address (IPv6 by its /64), which `protobase serve` sets from the connection and its trusted proxies, or `unknown`,
 * one bucket for every request without one (several addresses included, since the leftmost is whatever the client
 * sent). In development and tests a request without one is `127.0.0.1`.
 */
export const clientAddress = (headers: Headers) => getIP(headers, {}) ?? 'unknown'

/** The most keys a limit counts at once: a new key past it forgets the one whose window began first. */
export const rateLimitKeys = 10_000

/**
 * At most `perMinute` takes per key in a fixed window of a minute, kept in this process. Keys whose window has passed are
 * dropped as new ones come, and at most `maxKeys` are kept, the oldest window dropped first, so memory stays bounded
 * however many clients come within a minute.
 */
export const createRateLimit = ({ now = Date.now, maxKeys = rateLimitKeys }: { now?: () => number; maxKeys?: number } = {}) => {
  // In the order their windows began, so the first entry is the oldest.
  const windows = new Map<string, { start: number; count: number }>()

  const prune = (at: number) => {
    for (const [key, window] of windows) if (at - window.start >= windowMs) windows.delete(key)
  }

  const open = (key: string, at: number) => {
    prune(at)
    windows.delete(key)
    if (windows.size >= maxKeys) windows.delete(windows.keys().next().value!)
    windows.set(key, { start: at, count: 1 })
  }

  // The seconds until `key`'s window lets a take through again, `0` when it would now.
  const wait = (key: string, perMinute: number, at: number) => {
    const current = windows.get(key)
    if (!current || at - current.start >= windowMs || current.count < perMinute) return 0
    return Math.ceil((current.start + windowMs - at) / 1000)
  }

  /** Counts a take for `key`: `0` when allowed, else the seconds until its window lets it through again. */
  const take = (key: string, perMinute: number) => {
    const at = now()
    const current = windows.get(key)
    if (!current || at - current.start >= windowMs) {
      open(key, at)
      return 0
    }
    const seconds = wait(key, perMinute, at)
    if (seconds > 0) return seconds
    current.count += 1
    return 0
  }

  /** Whether `key` has spent its `perMinute` takes, without taking one: the seconds to wait, or `0`. */
  const spent = (key: string, perMinute: number) => wait(key, perMinute, now())

  return { take, spent }
}

export type RateLimit = ReturnType<typeof createRateLimit>
