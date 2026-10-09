import type { GridRow } from './column-spec'

export type RowSource = {
  total: number
  /** Computes a row synchronously, for mocks. */
  rowAt?: (index: number) => GridRow
  /** Loads `count` rows from `start` (a multiple of the page size), for a live server. */
  loadRows?: (start: number, count: number) => Promise<GridRow[]>
}

export const createRowSource = (total: number, rowAt: (index: number) => GridRow): RowSource => ({ total, rowAt })

/** Mocks a filtered view: `total` rows sampled evenly from `base`, each forced to satisfy the filter. */
export const createFilteredSource = (base: RowSource, total: number, matchFilter: (row: GridRow, index: number) => GridRow): RowSource => {
  const stride = base.total / total
  const baseRowAt = base.rowAt
  if (!baseRowAt) throw new Error('Not implemented: filtered mock sources need a synchronous base source')
  return { total, rowAt: (index) => matchFilter(baseRowAt(Math.floor(index * stride)), index) }
}
