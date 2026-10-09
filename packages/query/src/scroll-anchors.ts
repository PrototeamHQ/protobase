import type { CheckedFilter, ResourceModel, SortSpec } from '@protobase/schema'
import { ascendingAnchors, descendingAnchors, type ScrollAnchor } from './anchor-positions'
import { requireField } from './columns'
import { encodeCursor } from './cursor'
import type { Db } from './db'
import { QueryError } from './errors'
import { estimateCount } from './estimate-count'
import { exactCount } from './exact-count'
import { exactAnchors, exactSeek } from './scroll-exact'
import { scrollMode } from './scroll-mode'
import { readColumnStats } from './scroll-stats'
import type { Scope } from './scope'
import { effectiveSort, type Direction } from './sort'

export type ScrollAnchors = {
  mode: 'exact' | 'statistics'
  totalRows: number
  anchors: ScrollAnchor[]
  /** Most common values of the sort column with their share of rows; empty in exact mode. */
  mostCommon: Array<{ value: string; frequency: number }>
  /** Cursor for a page that starts at `position` (undefined means the first page); no OFFSET is used. */
  seekToPosition: (position: number) => Promise<string | undefined>
}

export type ScrollAnchorOptions = {
  direction?: Direction
  anchorCount?: number
  filter?: CheckedFilter
  scope?: Scope
  /** The full ordering the cursors will be read with (leading field must be `sortField`); defaults to just `sortField`. */
  sort?: SortSpec
}

const defaultAnchorCount = 100

/**
 * Internal: statistics-mode anchors are table-wide pg_stats values, which may belong to rows the caller cannot see,
 * so no route may return them; use seekToPosition, which only returns visible rows.
 * Scrollbar support for a sort on `sortField` (primary key as tie-breaker, as in listQuery).
 * exact: window-function positions (under 100k rows). statistics: pg_stats histogram, positions are approximate.
 * With a filter, exact mode ranks only matching rows. Statistics mode scales the table-wide positions by the planner's
 * selectivity estimate for the filter (filtered estimate / table estimate), so they are rougher still.
 * With a tenant scope, exact mode is exact within the tenant; statistics mode scales the table-wide histogram to the
 * tenant's row count, which assumes the tenant's values are distributed like the table's.
 * In statistics mode seekToPosition returns a boundary cursor on the leading sort column, which listQuery accepts
 * for any sort that begins with the same field and direction.
 */
export const scrollAnchors = async (db: Db, model: ResourceModel, sortField: string, options: ScrollAnchorOptions = {}): Promise<ScrollAnchors> => {
  const { direction = 'asc', anchorCount = defaultAnchorCount, filter, scope, sort = [[sortField, direction]] } = options
  if (!Number.isInteger(anchorCount) || anchorCount < 2) throw new QueryError('invalid_option', 'anchorCount must be at least 2')
  const field = requireField(model, sortField, 'sortable')
  const keys = effectiveSort(model, sort)

  const mode = scrollMode(await estimateCount(db, model, filter, scope))
  if (mode === 'sampled') {
    throw new Error('Not implemented: sampled scroll mode for tables above 5M rows needs a sampling strategy, statistics are too coarse there')
  }

  if (mode === 'exact') {
    const totalRows = await exactCount(db, model, filter, scope)
    const step = Math.max(1, Math.ceil(totalRows / anchorCount))
    return {
      mode,
      totalRows,
      anchors: await exactAnchors(db, model, keys, step, scope, filter),
      mostCommon: [],
      seekToPosition: position => exactSeek(db, model, keys, scope, filter, Math.min(position, totalRows - 1)),
    }
  }

  const stats = await readColumnStats(db, model, field)
  const tableRows = await estimateCount(db, model, undefined, scope)
  const totalRows = filter ? await estimateCount(db, model, filter, scope) : tableRows
  const selectivity = tableRows > 0 ? Math.min(1, totalRows / tableRows) : 1
  const ascending = ascendingAnchors(stats, tableRows, field.type)
    .map(anchor => ({ ...anchor, position: Math.round(anchor.position * selectivity) }))
  const anchors = direction === 'asc' ? ascending : descendingAnchors(ascending, totalRows)
  return {
    mode,
    totalRows,
    anchors,
    mostCommon: stats.commonValues.map((value, i) => ({ value, frequency: stats.commonFrequencies[i] ?? 0 })),
    seekToPosition: async position => {
      if (position <= 0) return undefined
      const anchor = anchors.findLast(candidate => candidate.position <= position)
      return anchor && anchor.position > 0 ? encodeCursor(keys, [anchor.value]) : undefined
    },
  }
}
