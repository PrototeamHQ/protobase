import { describe, expect, it, vi } from 'vitest'
import { followLive, type LiveChange } from './live'
import { createTransport } from './transport'

const stream = (...events: object[]) =>
  new Response(events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(''), { headers: { 'content-type': 'text/event-stream' } })

describe('followLive', () => {
  it('hands on changes and resyncs, and connects again from the last cursor after the stream ends', async () => {
    const urls: string[] = []
    const answers = [
      () => stream({ type: 'current', cursor: '4' }, { type: 'changes', cursor: '6', changes: [{ resource: 'orders', key: '1', operation: 'update' }] }),
      () => stream({ type: 'resync', cursor: '9' }),
      () => Promise.reject(new TypeError('offline')),
    ]
    const fetch = vi.fn(async (url: string | URL | Request) => {
      urls.push(String(url))
      return (answers[urls.length - 1] ?? (() => new Promise<Response>(() => {})))()
    }) as unknown as typeof globalThis.fetch
    const changes: LiveChange[][] = []
    const resyncs: number[] = []
    const retries: unknown[] = []
    const stop = followLive(createTransport({ baseUrl: '/api/v1', fetch }), { onChanges: (batch) => changes.push(batch), onResync: () => resyncs.push(1), onRetry: (error) => retries.push(error) }, () => 0)
    await vi.waitFor(() => expect(urls).toHaveLength(4))
    stop()
    expect(urls).toEqual(['/api/live', '/api/live?after=6', '/api/live?after=9', '/api/live?after=9'])
    expect(changes).toEqual([[{ resource: 'orders', key: '1', operation: 'update' }]])
    expect(resyncs).toEqual([1])
    expect(retries).toEqual([undefined, undefined, new TypeError('offline')])
  })
})
