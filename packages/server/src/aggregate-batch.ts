import { z } from 'zod'
import { aggregateScan, readIdentity, withoutField, type Granularity, type ScanRequests, type ScanResults, type Scope } from '@protobase/query'
import type { CheckedFilter, FilterExpr } from '@protobase/schema'
import { facetParams, histogramParams, namedFacets, seriesParams, seriesRange } from './aggregate-service'
import type { Deps } from './deps'
import { parseParams } from './params'
import { badRequest } from './problem'
import { labelRequests } from './related-labels'
import type { Entry } from './registry'
import { readFilter } from './related-filter'
import { requestAccess, requireOperation } from './request-access'
import { readTransaction } from './transactions'
import type { Session } from './types'

/** How many reads of each kind one batch holds at most. */
export const maxBatchReads = 100

const batchBody = z.object({
  facets: z.array(facetParams).max(maxBatchReads).default([]),
  histograms: z.array(histogramParams).max(maxBatchReads).default([]),
  series: z.array(seriesParams).max(maxBatchReads).default([]),
})

type Scan = { filter: CheckedFilter | undefined; scope: Scope; requests: Required<ScanRequests>; results?: ScanResults }

// The reads of a batch by the rows each keeps to: reads that filter the same rows share one scan.
const scansOf = () => {
  const scans = new Map<string, Scan>()
  const place = <K extends keyof ScanRequests>(filter: CheckedFilter | undefined, scope: Scope, kind: K, request: Required<ScanRequests>[K][number]) => {
    const id = readIdentity(filter, scope)
    const scan = scans.get(id) ?? { filter, scope, requests: { facets: [], histograms: [], series: [] } }
    scans.set(id, scan)
    const requests = scan.requests[kind] as Array<typeof request>
    requests.push(request)
    return { scan, index: requests.length - 1 }
  }
  return { scans: () => [...scans.values()], place }
}

type Placed = { scan: Scan; index: number }

const resultOf = <K extends keyof ScanResults>(placed: Placed, kind: K): ScanResults[K][number] => placed.scan.results![kind][placed.index]!

// One item after another, so the queries they send keep their order.
const inOrder = async <T, R>(items: T[], each: (item: T) => Promise<R>) => {
  const results: R[] = []
  for (const item of items) results.push(await each(item))
  return results
}

/**
 * Several `:facets`, `:histogram` and `:series` reads of one resource in one request, each answered as its own method
 * answers it, in request order. Reads that filter the same rows share their scans of the table (`aggregateScan`); each
 * keeps its own access, scan guard and labels.
 */
export const batchAggregates = async (deps: Deps, entry: Entry, session: Session, input: unknown, within?: FilterExpr) => {
  const params = parseParams(batchBody, input)
  const access = await requestAccess(deps, entry, session)
  requireOperation(access, 'list')
  const { model } = access
  const read = (source?: string) => readFilter(access, model, access.full, source, undefined, within)
  const { scans, place } = scansOf()

  const facets = await inOrder(params.facets, async ({ field, filter: source, limit, label }) => {
    const { filter, scope } = await read(source)
    const labels = label === undefined ? [] : await labelRequests(deps, session, model, [field], `${field}.${label}`)
    const others = withoutField(filter, field)
    const warning = await deps.guard(entry, { ...(others && { filter: others }), groupBy: field }, { model, scope })
    return { field, labels, warning, placed: place(others, scope, 'facets', { field, ...(limit !== undefined && { limit }) }) }
  })
  const histograms = await inOrder(params.histograms, async ({ field, filter: source, buckets }) => {
    const { filter, scope } = await read(source)
    return { field, placed: place(filter, scope, 'histograms', { field, buckets }) }
  })
  const series = await inOrder(params.series, async (one) => {
    const { filter, scope } = await read(one.filter)
    // A hidden field is refused exactly like an unknown one
    if (!model.fields[one.field]) throw badRequest('invalid-parameter', `Unknown field "${one.field}"`, { errors: [{ parameter: 'field', message: 'Unknown field' }] })
    const timeZone = one.time_zone ?? 'UTC'
    const granularity = one.granularity as Granularity
    const range = await seriesRange(deps, access, one.field, one, timeZone, scope)
    return { field: one.field, granularity, timeZone, placed: range && place(filter, scope, 'series', { field: one.field, range, granularity, timeZone }) }
  })

  const body = await readTransaction(deps.db, deps.statementTimeoutMs, async (trx) => {
    for (const scan of scans()) scan.results = await aggregateScan(trx, model, scan.filter, scan.scope, scan.requests)
    return {
      facets: await inOrder(facets, async ({ field, labels, placed }) => ({ field, facets: await namedFacets(trx, labels, field, resultOf(placed, 'facets')) })),
      histograms: histograms.map(({ field, placed }) => ({ field, ...resultOf(placed, 'histograms') })),
      series: series.map(({ field, granularity, timeZone, placed }) => ({ field, granularity, time_zone: timeZone, points: placed ? resultOf(placed, 'series') : [] })),
    }
  })
  return { body, warning: facets.find((facet) => facet.warning)?.warning }
}
