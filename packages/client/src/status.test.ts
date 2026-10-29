import { describe, expect, it } from 'vitest'
import { createClient } from './client'

describe('status', () => {
  it("reads, sets and clears the signed-in person's status, and reads the people's, beside the API", async () => {
    const calls: { method: string | undefined; url: string; body: unknown }[] = []
    const lunch = { userId: 'u1', availability: 'busy', text: 'Having lunch', clearsAt: '2026-10-29T13:00:00.000Z' }
    const fetch = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
      calls.push({ method: init.method, url: String(input), body: init.body })
      if (init.method === 'DELETE') return new Response(null, { status: 204 })
      return String(input).endsWith('/people') ? Response.json({ statuses: [lunch] }) : Response.json({ status: init.method === 'PUT' ? lunch : null })
    }) as typeof globalThis.fetch
    const { status } = createClient({ fetch, baseUrl: 'https://app.example/api/v1', token: async () => 'token' })
    expect(await status.own()).toBeNull()
    expect(await status.set({ availability: 'busy', text: 'Having lunch', clearsAt: lunch.clearsAt })).toEqual(lunch)
    await status.clear()
    expect(await status.people()).toEqual([lunch])
    expect(calls).toEqual([
      { method: 'GET', url: 'https://app.example/api/status', body: undefined },
      { method: 'PUT', url: 'https://app.example/api/status', body: JSON.stringify({ availability: 'busy', text: 'Having lunch', clearsAt: lunch.clearsAt }) },
      { method: 'DELETE', url: 'https://app.example/api/status', body: undefined },
      { method: 'GET', url: 'https://app.example/api/status/people', body: undefined },
    ])
  })
})
