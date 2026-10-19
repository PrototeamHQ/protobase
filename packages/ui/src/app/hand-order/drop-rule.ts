import { arrayMove } from '@dnd-kit/sortable'

/** A record dropped while re-ranking: the records as the API gives them, in the order the drop leaves them, and its place among them, 0 the first. */
export type Drop = { record: Record<string, unknown>; order: Record<string, unknown>[]; index: number }

/**
 * Where a re-ranked record may land, a view's `drag.rule`: why `drop.record` may not be at `drop.index`, in the app's own
 * words, or nothing when it may.
 */
export type DropRule = (drop: Drop) => string | undefined

/**
 * Where the record at `from` of `records` lands when dropped at `to`: there when `rule` allows it, else at the first
 * place below that it allows, with the reason it refused `to`. With none below, it stays at `from`, with that reason.
 */
export const allowedDrop = (records: Record<string, unknown>[], from: number, to: number, rule: DropRule): { to: number; reason?: string } => {
  const record = records[from]!
  let reason: string | undefined
  for (let index = to; index < records.length; index++) {
    const refused = rule({ record, order: arrayMove(records, from, index), index })
    if (refused === undefined) return { to: index, ...(reason !== undefined && { reason }) }
    reason ??= refused
  }
  return { to: from, reason: reason! }
}
