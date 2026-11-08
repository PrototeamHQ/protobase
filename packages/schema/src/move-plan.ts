import { reorderSpan } from './reorder-span'

/** A record of the list as stored: its key as URL text and its value of the order field. */
export type Ranked = { key: string; rank: unknown }

/**
 * The records a `move` renumbers, from `start` on, none when the record is already there; `stale` when the place it
 * was dropped is not there any more.
 */
export type MovePlan = { keys: string[]; start: number } | { stale: true }

/**
 * Where `moved` goes in `rows`, the list in its stored order: just after `after`, or first when that is null. The place
 * is still the one the move was dropped at when the record after `after`, leaving out `moved`, is `before` (null: none;
 * undefined, unknown to the caller: not checked), whatever else changed in the list. Then, unless it is there already, the shortest stretch from the new order that saves it (see `reorderSpan`).
 */
export const movePlan = (rows: Ranked[], moved: string, after: string | null, before: string | null | undefined): MovePlan | undefined => {
  const from = rows.findIndex((row) => row.key === moved)
  if (from === -1) return undefined
  const others = rows.filter((row) => row.key !== moved)
  const at = after === null ? 0 : others.findIndex((row) => row.key === after) + 1
  if (at === 0 && after !== null) return { stale: true }
  if (before !== undefined && (others[at]?.key ?? null) !== before) return { stale: true }
  if (at === from) return { keys: [], start: 1 }
  const order = [...others.slice(0, at), rows[from]!, ...others.slice(at)]
  const span = reorderSpan(order.map((row) => row.rank), Math.min(from, at), Math.max(from, at))
  return { keys: order.slice(span.first, span.last + 1).map((row) => row.key), start: span.start }
}
