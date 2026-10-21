/**
 * At most `max` takes per key in a fixed window of `windowMs`, which all keys share: it starts at the first take after
 * the last one ended, and then every count starts over, so memory follows the keys of the current window. A refused take
 * does not count. Returns whether one more take for the key fits.
 */
export const fixedWindows = (max: number, windowMs: number, now = () => Date.now()) => {
  let start = -Infinity
  let counts = new Map<string, number>()
  return (key: string) => {
    const at = now()
    if (at - start >= windowMs) {
      start = at
      counts = new Map()
    }
    const count = counts.get(key) ?? 0
    if (count >= max) return false
    counts.set(key, count + 1)
    return true
  }
}

/** `fixedWindows` for one key. */
export const fixedWindow = (max: number, windowMs: number, now = () => Date.now()) => {
  const take = fixedWindows(max, windowMs, now)
  return () => take('')
}
