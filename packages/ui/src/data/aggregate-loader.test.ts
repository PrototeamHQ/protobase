import { describe, expect, it, vi } from 'vitest'
import type { AggregateBatch, Client } from '@protobase/client'
import { aggregateLoader, batchReads } from './aggregate-loader'

const answering = (answer: (resource: string, batch: Required<AggregateBatch>) => unknown) => {
  const batchAggregates = vi.fn(async (resource: string, batch: Required<AggregateBatch>) => answer(resource, batch))
  return { client: { batchAggregates } as unknown as Client, batchAggregates }
}

// Each read answered with what it asked for, so a test sees which answer went to which read
const echo = (_: string, batch: Required<AggregateBatch>) => ({
  facets: batch.facets.map(({ field }) => [{ value: field, count: 1 }]),
  histograms: batch.histograms.map(({ field }) => ({ field, min: 0, max: 1, buckets: [] })),
  series: batch.series.map(({ field }) => ({ field, granularity: 'day', timeZone: 'UTC', points: [] })),
})

describe('aggregateLoader', () => {
  it('sends the reads started together as one request per resource, each getting its own answer', async () => {
    const { client, batchAggregates } = answering(echo)
    const loader = aggregateLoader(client)
    const [kind, price, chart, other] = await Promise.all([
      loader.facets('listings', 'kind', { filter: 'a = 1', limit: 50 }),
      loader.histogram('listings', 'price', { buckets: 24 }),
      loader.series('listings', { field: 'published_at', range: '30d' }),
      loader.facets('agencies', 'city'),
    ])
    expect(batchAggregates).toHaveBeenCalledTimes(2)
    expect(batchAggregates).toHaveBeenCalledWith('listings', {
      facets: [{ field: 'kind', filter: 'a = 1', limit: 50 }],
      histograms: [{ field: 'price', buckets: 24 }],
      series: [{ field: 'published_at', range: '30d' }],
    })
    expect([kind, price.min, chart.field, other]).toEqual([[{ value: 'kind', count: 1 }], 0, 'published_at', [{ value: 'city', count: 1 }]])
  })

  it('starts another request for reads started later', async () => {
    const { client, batchAggregates } = answering(echo)
    const loader = aggregateLoader(client)
    await loader.facets('listings', 'kind')
    await loader.facets('listings', 'kind')
    expect(batchAggregates).toHaveBeenCalledTimes(2)
  })

  it('sends a full batch and starts the next one', async () => {
    const { client, batchAggregates } = answering(echo)
    const loader = aggregateLoader(client)
    const answers = await Promise.all(Array.from({ length: batchReads + 1 }, (_, index) => loader.facets('listings', `f${index}`)))
    expect(batchAggregates.mock.calls.map(([, batch]) => batch.facets.length)).toEqual([batchReads, 1])
    expect(answers.at(-1)).toEqual([{ value: `f${batchReads}`, count: 1 }])
  })

  it('fails every read of a request that fails', async () => {
    const failure = new Error('statement timeout')
    const { client } = answering(() => Promise.reject(failure))
    const loader = aggregateLoader(client)
    const reads = [loader.facets('listings', 'kind'), loader.histogram('listings', 'price'), loader.series('listings', { field: 'published_at' })]
    expect(await Promise.allSettled(reads)).toEqual(reads.map(() => ({ status: 'rejected', reason: failure })))
  })
})
