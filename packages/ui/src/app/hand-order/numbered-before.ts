import type { BatchResult } from '@protobase/client'

/**
 * The value of the order field each record numbered by a batch's `reorder` and `move` operations had before the first
 * of them, as the server had it, by `idOf` the record: what an undo puts back, rather than the order the list loaded with.
 */
export const numberedBefore = (results: BatchResult['results'], idOf: (record: Record<string, unknown>) => string) => {
  const before = new Map<string, unknown>()
  for (const written of results) {
    if (written.op !== 'reorder' && written.op !== 'move') continue
    for (const entry of written.records) {
      const id = idOf(entry.record)
      if (!before.has(id)) before.set(id, entry.previous)
    }
  }
  return before
}
