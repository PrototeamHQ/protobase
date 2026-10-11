const second = 1000
const minute = 60 * second
const hour = 60 * minute

/**
 * The waits before each retry, as Standard Webhooks recommends: 5 s, 5 m, 30 m, 2 h, 5 h, 10 h, 14 h, 20 h and 24 h,
 * about three days in all, so a delivery has 10 tries.
 */
export const retryDelays = [5 * second, 5 * minute, 30 * minute, 2 * hour, 5 * hour, 10 * hour, 14 * hour, 20 * hour, 24 * hour]

export const maxTries = retryDelays.length + 1

/**
 * How long to wait before the try after `tried` failed ones: the schedule with up to 10% jitter, or longer when the
 * receiver asked with Retry-After, up to a day. `undefined` once the tries are used up.
 */
export const nextRetryDelay = (tried: number, retryAfterMs?: number, random = Math.random) => {
  const scheduled = retryDelays[tried - 1]
  if (scheduled === undefined) return undefined
  const jittered = Math.round(scheduled * (1 + (random() * 2 - 1) * 0.1))
  return Math.min(Math.max(jittered, retryAfterMs ?? 0), 24 * hour)
}

/** A Retry-After header in milliseconds from `now`: seconds, or an HTTP date. */
export const retryAfterMs = (header: string | null, now = Date.now()) => {
  if (header === null) return undefined
  const text = header.trim()
  if (/^\d+$/.test(text)) return Number(text) * second
  const at = Date.parse(text)
  return Number.isNaN(at) ? undefined : Math.max(0, at - now)
}
