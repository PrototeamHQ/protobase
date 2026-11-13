/** The soft limit on the bytes of the start cache's queries: past it, the least recently used are evicted. */
export const softLimitBytes = 4 * 1024 * 1024

/** A saved query as the limit weighs it: its size, when it was last used, and whether it is never evicted. */
export type Sized = { hash: string; bytes: number; lastUsed: number; pinned: boolean }

/**
 * The queries kept: all of them while their total stays within `limit`. Once it passes, the least recently used
 * queries that are not pinned are evicted, oldest last use first, until the total is back within it.
 */
export const withinLimit = (entries: readonly Sized[], limit = softLimitBytes) => {
  let total = entries.reduce((sum, entry) => sum + entry.bytes, 0)
  const kept = new Set(entries.map((entry) => entry.hash))
  const oldestFirst = entries.filter((entry) => !entry.pinned).sort((a, b) => a.lastUsed - b.lastUsed)
  for (const entry of oldestFirst) {
    if (total <= limit) break
    kept.delete(entry.hash)
    total -= entry.bytes
  }
  return kept
}

const encoder = new TextEncoder()

/** The bytes `value` takes written as JSON in UTF-8, as near as the page can measure what IndexedDB stores. */
export const byteSize = (value: unknown) => encoder.encode(JSON.stringify(value) ?? '').length
