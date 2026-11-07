import { limits } from '../../limits'

const units: Record<string, number> = { second: 1, minute: 60, hour: 3600, day: 86_400 }

/**
 * The seconds a cache entry serves, from a number of seconds or text such as `10 minutes`, at most
 * `limits.cacheMaxSeconds`; undefined for anything else, zero and below included, so such an entry is never written.
 */
export const cacheSeconds = (ttl: unknown): number | undefined => {
  if (typeof ttl === 'number') return Number.isFinite(ttl) && ttl >= 1 ? Math.min(Math.floor(ttl), limits.cacheMaxSeconds) : undefined
  if (typeof ttl !== 'string') return
  const match = /^(\d+) (second|minute|hour|day)s?$/.exec(ttl.trim())
  if (!match) return
  return cacheSeconds(Number(match[1]) * units[match[2]!]!)
}
