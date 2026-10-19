import { encodeKey } from '@protobase/schema/internal'

/** A record and one it depends on, with their ranks as they are now. */
export type RankPair = { dependent: string | number; depended: string | number; dependent_rank: unknown; depended_rank: unknown }

const atOrAbove = (dependent: unknown, depended: unknown) => dependent !== null && depended !== null && Number(dependent) <= Number(depended)

/**
 * The first pair whose record now ranks at or above the record it depends on but did not before: `before` holds the
 * ranks the records a write changed had, by their encoded key, `null` for a new one. A pair out of order already stays
 * as it is, so a write never fails on an order it did not break.
 */
export const newlyAbove = (pairs: readonly RankPair[], before: ReadonlyMap<string, unknown>) => {
  const was = (key: string | number, now: unknown) => {
    const name = encodeKey([key])
    return before.has(name) ? before.get(name) : now
  }
  return pairs.find((pair) => atOrAbove(pair.dependent_rank, pair.depended_rank) && !atOrAbove(was(pair.dependent, pair.dependent_rank), was(pair.depended, pair.depended_rank)))
}
