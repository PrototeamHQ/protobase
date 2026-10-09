import type { FieldType } from '@protobase/schema'

export type ColumnStats = {
  nullFraction: number
  bounds: string[]
  commonValues: string[]
  commonFrequencies: number[]
}

export type ScrollAnchor = { position: number; value: string }

type Comparator = (a: string, b: string) => number

const comparators: Partial<Record<FieldType, Comparator>> = {
  integer: (a, b) => Number(a) - Number(b),
  bigint: (a, b) => Number(a) - Number(b),
  decimal: (a, b) => Number(a) - Number(b),
  currency: (a, b) => Number(a) - Number(b),
  date: (a, b) => Date.parse(a) - Date.parse(b),
  timestamp: (a, b) => Date.parse(a) - Date.parse(b),
  uuid: (a, b) => (a < b ? -1 : a > b ? 1 : 0),
}

/**
 * Approximate row position of each histogram bound, in ascending sort order.
 * Histogram buckets hold equal shares of the rows that are neither NULL nor most-common values.
 * Most-common values are interleaved by value where the type has a JS ordering that matches Postgres;
 * for other types (text, enum) their rows are not counted below a bound, so positions are less precise.
 */
export const ascendingAnchors = (stats: ColumnStats, totalRows: number, type: FieldType): ScrollAnchor[] => {
  const buckets = stats.bounds.length - 1
  const compare = comparators[type]
  const commonShare = stats.commonFrequencies.reduce((sum, frequency) => sum + frequency, 0)
  const histogramShare = Math.max(0, 1 - stats.nullFraction - commonShare)
  return stats.bounds.map((value, i) => {
    const histogramRows = (totalRows * histogramShare * i) / buckets
    const commonRows = compare
      ? stats.commonValues.reduce(
          (sum, common, j) => (compare(common, value) < 0 ? sum + (stats.commonFrequencies[j] ?? 0) * totalRows : sum),
          0,
        )
      : 0
    return { position: Math.round(histogramRows + commonRows), value }
  })
}

/** Anchors for a descending sort: same bounds walked from the top, positions measured from the first row. */
export const descendingAnchors = (ascending: ScrollAnchor[], totalRows: number): ScrollAnchor[] =>
  ascending.map(anchor => ({ position: Math.max(0, totalRows - anchor.position), value: anchor.value })).reverse()
