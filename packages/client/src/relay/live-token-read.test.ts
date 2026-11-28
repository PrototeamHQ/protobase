import { describe, expect, it, vi } from 'vitest'
import { createTransport } from '../transport'
import { readLiveToken } from './live-token-read'

describe('readLiveToken', () => {
  it("reads one record of the resource with Prefer: live and gives the response's live token", async () => {
    const fetch = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => new Response('[]', { headers: { 'protobase-live': 'token-1' } }))
    const token = await readLiveToken(createTransport({ baseUrl: '/api/v1', fetch }), 'chat messages')
    expect(token).toBe('token-1')
    expect(fetch.mock.calls[0]?.[0]).toBe('/api/v1/chat%20messages?limit=1')
    expect(new Headers(fetch.mock.calls[0]?.[1]?.headers).get('prefer')).toBe('live')
  })

  it('gives undefined when the read carries no live token', async () => {
    const fetch = vi.fn(async () => new Response('[]'))
    expect(await readLiveToken(createTransport({ baseUrl: '/api/v1', fetch }), 'notes')).toBeUndefined()
  })
})
