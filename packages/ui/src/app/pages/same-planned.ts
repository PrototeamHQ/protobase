import type { Planned } from './planned'

/**
 * `before` when `next` holds the same: the same state, total, names and photos and the same rows in the same order,
 * so a block's memos on it hold; otherwise `next`.
 */
export const samePlanned = (before: Planned | undefined, next: Planned | undefined) => {
  if (!before || !next) return next
  const same =
    before.isPending === next.isPending &&
    before.error === next.error &&
    before.total === next.total &&
    before.labels === next.labels &&
    before.photos === next.photos &&
    before.rows.length === next.rows.length &&
    before.rows.every((row, index) => row === next.rows[index])
  return same ? before : next
}
