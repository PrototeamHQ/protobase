import { describe, expect, it } from 'vitest'
import { createClient } from './client'

describe('rings', () => {
  it('lists the calls that ring the signed-in user, and declines one by its call, beside the API', async () => {
    const ring = { call: '4b1f', resource: 'conversations', key: '7', started_by: 'ann', title: 'Ann is calling', body: null, remaining_ms: 29_000 }
    const calls: { url: string; init: RequestInit }[] = []
    const fetch = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
      calls.push({ url: String(input), init })
      return init.method === 'POST' ? new Response(null, { status: 204 }) : Response.json({ items: [ring] })
    }) as typeof globalThis.fetch
    const client = createClient({ fetch, baseUrl: 'https://app.example/api/v1', token: async () => 'token' })
    expect(await client.rings.list()).toEqual([ring])
    await client.rings.decline('4b1f')
    expect(calls.map((call) => [call.init.method, call.url])).toEqual([
      ['GET', 'https://app.example/api/calls/rings'],
      ['POST', 'https://app.example/api/calls/rings/4b1f/decline'],
    ])
  })
})
