import type { ResourceModel } from '@protobase/schema'
import { encodeKey } from '@protobase/schema/internal'
import { recordKey } from '../../live/model-helpers'
import { placing } from '../displays/board-place'
import type { ListDisplayRow } from '../displays/list-displays'
import { reorderSpan } from '../hand-order/reorder-span'
import { text } from './messages'
import type { RankBound, RankBounds } from './rank-bounds'

/** Where a dropped card lands: its place in the column, and the rank it takes there when that must be above its column's order. */
export type RankedPlace = { index: number; bump?: number }

type Request = { model: ResourceModel; rank: string; rows: ListDisplayRow[]; row: ListDisplayRow; index: number; bounds: RankBounds; title: string }

const isRank = (value: unknown) => value !== null && value !== undefined && value !== ''

/**
 * Where a card of a ranked board dropped at `index` of a column, its cards `rows`, may land by `bounds`: at the first
 * place from there down where the ranks its `reorder` gives keep it below each record it depends on and above each that
 * depends on it, wherever those are. In the last place it may take a rank just above what it depends on, for a record
 * of another column that ranks above the whole column. With the reason it refused `index`; with no place, none.
 */
export const rankedPlace = ({ model, rank, rows, row, index, bounds, title }: Request): { place?: RankedPlace; reason?: string } => {
  const own = rows.some((entry) => entry.key === row.key)
  const end = own ? rows.length - 1 : rows.length
  let reason: string | undefined
  for (let at = index; at <= end; at++) {
    const { order, first, last } = placing(rows, row, at)
    const ranks = order.map((entry) => entry.record[rank])
    const span = reorderSpan(ranks, first, last)
    const ranked = new Map(order.map((entry, i) => [encodeKey(recordKey(model, entry.record)), i >= span.first && i <= span.last ? span.start + i - span.first : ranks[i]]))
    const rankOf = (bound: RankBound) => (ranked.has(bound.key) ? ranked.get(bound.key) : bound.rank)
    const mine = Number(ranked.get(encodeKey(recordKey(model, row.record))))
    const above = bounds.after.filter((bound) => isRank(rankOf(bound)) && Number(rankOf(bound)) >= mine)
    const below = bounds.before.find((bound) => isRank(rankOf(bound)) && Number(rankOf(bound)) <= mine)
    const refusal = below ? text('dependsOn', { record: below.title, other: title }) : above[0] && text('dependsOn', { record: title, other: above[0].title })
    if (!refusal) return { place: { index: at }, ...(reason !== undefined && { reason }) }
    reason ??= refusal
    if (at !== end || below) continue
    // Last in its column, nothing after it there keeps its rank down
    const bump = Math.max(...above.map((bound) => Number(rankOf(bound)))) + 1
    if (bounds.before.every((bound) => !isRank(rankOf(bound)) || Number(rankOf(bound)) > bump)) return { place: { index: at, bump }, reason }
  }
  return { reason: reason! }
}
