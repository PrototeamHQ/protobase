import type { AggregateBatch, AggregateBatchResult, Client, Facet, Histogram, Series } from '@protobase/client'

type Batch = Required<AggregateBatch>
type Kind = keyof Batch
type Answer = { [K in Kind]: AggregateBatchResult[K][number] }
type Waiting = { kind: Kind; index: number; resolve: (answer: never) => void; reject: (error: unknown) => void }
type Open = { batch: Batch; waiting: Waiting[] }

/** The most reads of one kind a `:batchAggregates` request takes; a page that starts more sends another. */
export const batchReads = 100

/**
 * Gathers the facet, histogram and series reads started in the same task into one `client.batchAggregates` request per
 * resource, so a list page's filters and chart cost one request, and the reads that share a filter one set of scans,
 * rather than one request and one scan each. Each read resolves with its own answer; when the request fails, every read
 * in it rejects with its error.
 */
export const aggregateLoader = (client: Client) => {
  const open = new Map<string, Open>()

  const send = async (resource: string, { batch, waiting }: Open) => {
    const sent = client.batchAggregates(resource, batch)
    const settled = await sent.then(
      (result) => ({ result }),
      (error: unknown) => ({ error }),
    )
    for (const read of waiting) {
      if ('error' in settled) read.reject(settled.error)
      else read.resolve(settled.result[read.kind][read.index] as never)
    }
  }

  const close = (resource: string, closing: Open) => {
    if (open.get(resource) !== closing) return
    open.delete(resource)
    void send(resource, closing)
  }

  const read = <K extends Kind>(resource: string, kind: K, request: Batch[K][number]) =>
    new Promise<Answer[K]>((resolve, reject) => {
      const known = open.get(resource)
      if (known && known.batch[kind].length >= batchReads) close(resource, known)
      const current = open.get(resource) ?? { batch: { facets: [], histograms: [], series: [] }, waiting: [] }
      if (!open.has(resource)) {
        open.set(resource, current)
        setTimeout(() => close(resource, current), 0)
      }
      const list = current.batch[kind] as Array<Batch[K][number]>
      list.push(request)
      current.waiting.push({ kind, index: list.length - 1, resolve: resolve as (answer: never) => void, reject })
    })

  return {
    facets: (resource: string, field: string, options: { filter?: string; limit?: number; label?: string } = {}): Promise<Facet[]> => read(resource, 'facets', { field, ...options }),
    histogram: (resource: string, field: string, options: { filter?: string; buckets?: number } = {}): Promise<Histogram> => read(resource, 'histograms', { field, ...options }),
    series: (resource: string, params: Batch['series'][number]): Promise<Series> => read(resource, 'series', params),
  }
}

export type AggregateLoader = ReturnType<typeof aggregateLoader>

// One loader per client, kept no longer than the client is.
const loaders = new WeakMap<Client, AggregateLoader>()

/** The loader that batches `client`'s aggregate reads. */
export const loaderOf = (client: Client) => {
  const known = loaders.get(client)
  if (known) return known
  const made = aggregateLoader(client)
  loaders.set(client, made)
  return made
}
