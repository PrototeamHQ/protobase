import { sql } from 'kysely'
import type { CheckedFilter, ResourceModel } from '@protobase/schema'
import { columnRef, requireField } from './columns'
import type { Db } from './db'
import { facetLimit, type FacetCount } from './facet-counts'
import { assertFilterRequirements } from './filter-requirements'
import { groupedCounts, type CountSet } from './grouped-counts'
import { bucketOf, histogramColumn, histogramOf, type Histogram } from './histogram'
import { histogramBounds } from './histogram-bounds'
import { toNumber } from './numbers'
import type { Scope } from './scope'
import { series as seriesOf, type SeriesPoint } from './series'
import { seriesBuckets, type BucketOptions } from './series-buckets'

export type ScanRequests = {
  facets?: Array<{ field: string; limit?: number }>
  histograms?: Array<{ field: string; buckets: number }>
  series?: Array<{ field: string } & BucketOptions>
}
export type ScanResults = { facets: FacetCount[][]; histograms: Histogram[]; series: SeriesPoint[][] }

const bucketText = (value: unknown) => sql`to_char(${value}, 'YYYY-MM-DD"T"HH24:MI:SS')`

// Every bucket of a series' range as `series` names them, the empty ones too; it reads no table.
const bucketList = async (db: Db, buckets: ReturnType<typeof seriesBuckets>) => {
  const { from, truncate, local, laterBucket, step } = buckets
  const result = await sql<{ bucket: string }>`select ${bucketText(sql`b`)} as bucket from generate_series(${truncate(local(from))}, ${laterBucket}, ${step}) as b order by b`.execute(db)
  return result.rows.map((row) => row.bucket)
}

// A series' bucket for a row in its range, null for any other.
const seriesKey = ({ col, from, to, bound, truncate, local, isDate }: ReturnType<typeof seriesBuckets>) =>
  sql`case when ${col} >= ${from}::${bound} and ${col} < ${to}::${bound} then ${bucketText(truncate(isDate ? sql`${col}::timestamp` : local(col)))} end`

// The groupings to count, each once however many reads ask for it.
const countSets = () => {
  const sets: CountSet[] = []
  const indexes = new Map<string, number>()
  const add = (id: string, set: CountSet) => {
    const known = indexes.get(id)
    if (known !== undefined) return known
    indexes.set(id, sets.length)
    sets.push(set)
    return sets.length - 1
  }
  return { sets, add }
}

/**
 * The facet counts, histograms and series of one filter and scope, each as `facetCounts`, `histogram` and `series` find
 * it, in few scans of the table however many are asked for: one for the bounds of every histogram, and one per
 * `setsPerScan` groupings that count facets' values, histograms' buckets and series' buckets together (`groupedCounts`).
 * The filter applies to each as given, so a facet that leaves out its own terms is asked for with them left out
 * (`withoutField`). Results come in request order.
 */
export const aggregateScan = async (db: Db, model: ResourceModel, filter: CheckedFilter | undefined, scope: Scope | undefined, requests: ScanRequests): Promise<ScanResults> => {
  const facets = (requests.facets ?? []).map(({ field, limit }) => ({ field, column: columnRef(requireField(model, field, 'filterable')), limit: facetLimit(limit) }))
  const histograms = (requests.histograms ?? []).map(({ field, buckets }) => ({ field, column: histogramColumn(model, field, buckets), buckets }))
  const series = (requests.series ?? []).map(({ field, ...options }) => ({ id: JSON.stringify([field, options]), buckets: seriesBuckets(model, field, options) }))
  await assertFilterRequirements(db, filter, scope)

  const bounds = await histogramBounds(db, model, filter, scope, histograms.map(({ column }) => column))
  const { sets, add } = countSets()
  const facetSets = facets.map(({ field, column }) => add(`facet:${field}`, { key: sql`${column}`, ranked: true }))
  // Only a histogram of several buckets over a spread of values needs its rows counted per bucket
  const histogramSets = histograms.map(({ field, column, buckets }, index) => {
    const { min, max } = bounds[index]!
    if (buckets === 1 || min === null || max === null || min === max) return
    // `least` passes over a null, so a row without a value would count in the last bucket
    return add(`histogram:${field}:${buckets}`, { key: sql`case when ${column} is not null then ${bucketOf(column, min, max, buckets)} end`, ranked: false })
  })
  // A time rollup's series add up the records its buckets count, which the shared row counts do not: each is its own query
  const ownSeries = model.buckets !== undefined
  const seriesSets = ownSeries ? [] : series.map(({ id, buckets }) => add(`series:${id}`, { key: seriesKey(buckets), ranked: false }))
  const counted = await groupedCounts(db, model, filter, scope, sets, Math.max(0, ...facets.map(({ limit }) => limit)))
  const lists: string[][] = []
  if (!ownSeries) for (const { buckets } of series) lists.push(await bucketList(db, buckets))
  const own: SeriesPoint[][] = []
  if (ownSeries) for (const { field, ...options } of requests.series ?? []) own.push(await seriesOf(db, model, field, { ...options, ...(filter && { filter }), ...(scope && { scope }) }))

  return {
    facets: facets.map(({ limit }, index) => counted[facetSets[index]!]!.slice(0, limit)),
    histograms: histograms.map(({ buckets }, index): Histogram => {
      const { min, max, count } = bounds[index]!
      if (min === null || max === null) return { min: null, max: null, buckets: [] }
      if (min === max) return { min, max, buckets: [{ from: min, to: max, count }] }
      const set = histogramSets[index]
      if (set === undefined) return histogramOf(min, max, buckets, new Map([[1, count]]))
      return histogramOf(min, max, buckets, new Map(counted[set]!.flatMap(({ value, count }) => (value === null ? [] : [[toNumber(value), count]]))))
    }),
    series: ownSeries ? own : series.map((_, index) => {
      const counts = new Map(counted[seriesSets[index]!]!.flatMap(({ value, count }) => (value === null ? [] : [[String(value), count]])))
      return lists[index]!.map((bucket) => ({ bucket, count: counts.get(bucket) ?? 0 }))
    }),
  }
}
