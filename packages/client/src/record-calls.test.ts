import { describe, expect, it, vi } from 'vitest'
import { callsPath } from './client'
import { recordCallsClient, type RecordCall } from './record-calls'
import { createTransport } from './transport'

const live: RecordCall = { id: '7', started_by: 'ann', started_at: '2026-10-29T10:00:00.000Z', ended_at: null, members: [{ member: 'ann', joined_at: '2026-10-29T10:00:00.000Z' }], removed: [] }

describe('a record\'s calls', () => {
  it('are read at the record\'s address', async () => {
    const fetch = vi.fn(async () => Response.json({ items: [live] })) as unknown as typeof globalThis.fetch
    const { calls } = recordCallsClient(createTransport({ baseUrl: '/api', fetch }), callsPath)
    expect(await calls('conversations', 42)).toEqual([live])
    expect(vi.mocked(fetch).mock.calls[0]![0]).toBe('/api/conversations/42:calls')
  })

  it('are followed as they change, skipping the stream\'s comment lines, and again after it ends', async () => {
    const urls: string[] = []
    const fetch = vi.fn(async (url: string | URL | Request) => {
      urls.push(String(url))
      if (urls.length > 1) return new Promise<Response>(() => {})
      return new Response(`data: ${JSON.stringify({ items: [live] })}\n\n: ping\n\ndata: ${JSON.stringify({ items: [] })}\n\n`, { headers: { 'content-type': 'text/event-stream' } })
    }) as unknown as typeof globalThis.fetch
    const seen: RecordCall[][] = []
    const stop = recordCallsClient(createTransport({ baseUrl: '/api', fetch }), callsPath, () => 0).watchCalls('conversations', 42, { onCalls: (calls) => seen.push(calls) })
    await vi.waitFor(() => expect(urls).toHaveLength(2))
    stop()
    expect(urls).toEqual(['/api/conversations/42:calls?watch=true', '/api/conversations/42:calls?watch=true'])
    expect(seen).toEqual([[live], []])
  })
})
