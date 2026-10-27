/**
 * At most `max` takes per key in a fixed window of `windowMs`, which all keys share: it starts at the first take after
 * the last one ended, and then every count starts over, so memory follows the keys of the current window. A refused take
 * does not count. Returns whether one more take for the key fits.
 */
export const fixedWindows = (max: number, windowMs: number, now = () => Date.now()) => {
  let start = -Infinity
  let counts = new Map<string, number>()
  /** Takes as many as each key names, only when they all fit: whether they did. */
  const all = (takes: ReadonlyMap<string, number>) => {
    const at = now()
    if (at - start >= windowMs) {
      start = at
      counts = new Map()
    }
    for (const [key, n] of takes) if ((counts.get(key) ?? 0) + n > max) return false
    for (const [key, n] of takes) counts.set(key, (counts.get(key) ?? 0) + n)
    return true
  }
  return Object.assign((key: string) => all(new Map([[key, 1]])), { all })
}

/** `fixedWindows` for one key. */
export const fixedWindow = (max: number, windowMs: number, now = () => Date.now()) => {
  const take = fixedWindows(max, windowMs, now)
  return () => take('')
}
