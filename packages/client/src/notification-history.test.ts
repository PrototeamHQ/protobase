import { describe, expect, it } from 'vitest'
import { createClient } from './client'

describe('notifications', () => {
  it('lists, counts and marks read the history beside the API, as JSON', async () => {
    const calls: { url: string; init: RequestInit }[] = []
    const fetch = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
      calls.push({ url: String(input), init })
      const url = String(input)
      if (init.method === 'POST') return new Response(null, { status: 204 })
      return url.endsWith('/unread') ? Response.json({ count: 3 }) : Response.json({ items: [], next: null })
    }) as typeof globalThis.fetch
    const client = createClient({ fetch, baseUrl: 'https://app.example/api/v1', token: async () => 'token' })
    expect(await client.notifications.list()).toEqual({ items: [], next: null })
    await client.notifications.list({ cursor: 'c 1', limit: 5 })
    expect(await client.notifications.unread()).toBe(3)
    await client.notifications.markRead('n_1')
    await client.notifications.markAllRead('2026-07-01T00:00:00.000Z')
    expect(calls.map((call) => [call.init.method, call.url, call.init.body])).toEqual([
      ['GET', 'https://app.example/api/notifications/history', undefined],
      ['GET', 'https://app.example/api/notifications/history?cursor=c+1&limit=5', undefined],
      ['GET', 'https://app.example/api/notifications/history/unread', undefined],
      ['POST', 'https://app.example/api/notifications/history/n_1/read', '{}'],
      ['POST', 'https://app.example/api/notifications/history/read', '{"upTo":"2026-07-01T00:00:00.000Z"}'],
    ])
    expect(calls[3]!.init.headers).toMatchObject({ authorization: 'Bearer token', 'content-type': 'application/json' })
  })

  it('refuses to mark an id that could leave the history', async () => {
    await expect(createClient({ fetch: (async () => new Response(null, { status: 204 })) as typeof fetch }).notifications.markRead('../devices/x')).rejects.toThrow('A history entry id is letters')
  })
})
