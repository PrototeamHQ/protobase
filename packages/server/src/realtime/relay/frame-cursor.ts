/** How long an id below the newest one read is asked for again: a frame another process has not committed yet. */
const gapMs = 2000
/** The most ids asked for again at once. */
const maxGaps = 1000

/**
 * Where a process is in the frames: every id up to `after` read, except the `gaps`. Processes take ids before they
 * commit, so a frame can commit after one with a higher id: an id skipped is asked for again for `gapMs`, and then given
 * up, as an id a failed insert took and never used.
 */
export const frameCursor = (after: bigint, visible: readonly bigint[] = [], now = () => Date.now()) => {
  let cursor = after
  const gaps = new Map<bigint, number>()

  const read = (ids: readonly bigint[]) => {
    const at = now()
    const seen = new Set(ids)
    for (const id of ids) gaps.delete(id)
    const newest = ids.reduce((max, id) => (id > max ? id : max), cursor)
    for (let id = newest - 1n; id > cursor && gaps.size < maxGaps; id -= 1n) if (!seen.has(id)) gaps.set(id, at)
    cursor = newest
    for (const [id, since] of gaps) if (at - since > gapMs) gaps.delete(id)
  }

  // The ids a snapshot saw below its newest one; those it did not see are gaps.
  if (visible.length > 0) {
    cursor = visible.reduce((min, id) => (id < min ? id : min)) - 1n
    read(visible)
  }

  return {
    /** What to read next: ids after `after`, and the `gaps`. */
    next: () => ({ after: cursor, gaps: [...gaps.keys()] }),
    /** Takes the ids just read. */
    read,
  }
}

export type FrameCursor = ReturnType<typeof frameCursor>
