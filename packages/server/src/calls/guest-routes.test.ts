import { describe, expect, it, vi } from 'vitest'
import { createErrorHandler } from '../error-handler'
import type { CallsRuntime } from './calls-runtime'
import type { CallsService } from './calls-service-type'
import { entriesPerMinute, refusalsPerMinute } from './guest-limits'
import { guestRoutes } from './guest-routes'
import type { GuestStore } from './guest-store'
import { guestTokenPrefix, linkTokenPrefix, newToken, tokenHash } from './guest-tokens'

const link = newToken(linkTokenPrefix)

// The guests' routes over a lobby with one live link, every request from the address in its `x-test-address`.
const lobby = () => {
  const tokens = new Map<string, string>()
  const guests = {
    enter: vi.fn<GuestStore['enter']>(async (input) => {
      if (!input.link.equals(tokenHash(linkTokenPrefix, link)!)) return { refused: 'gone' }
      tokens.set(input.token.toString('hex'), 'g1')
      return { guest: 'g1' }
    }),
    state: vi.fn<GuestStore['state']>(async (token) => (tokens.has(token.toString('hex')) ? { state: 'admitted', call: 'c1', publish: ['microphone'] } : undefined)),
    leave: vi.fn<GuestStore['leave']>(async () => {}),
  }
  const runtime = { guests: () => guests } as unknown as CallsRuntime
  const calls = { runtime: async () => runtime } as unknown as CallsService
  const app = guestRoutes({ calls, addressOf: (request) => request.headers.get('x-test-address'), onError: createErrorHandler(vi.fn()), report: vi.fn() })
  const request = (method: string, init: { from?: string; token?: string; body?: object } = {}) =>
    app.request('/lobby', {
      method,
      headers: { 'x-test-address': init.from ?? '1.2.3.4', 'content-type': 'application/json', ...(init.token && { authorization: `Bearer ${init.token}` }) },
      ...(init.body && { body: JSON.stringify(init.body) }),
    })
  return { request, guests }
}

describe("the guests' lobby", () => {
  it("takes a guest's name for a live link, and tells them their wait with their token alone", async () => {
    const { request } = lobby()
    const entered = await request('POST', { body: { link, name: 'Eve' } })
    expect(entered.status).toBe(201)
    expect(entered.headers.get('cache-control')).toBe('no-store')
    const { guest, token } = (await entered.json()) as { guest: string; token: string }
    expect(guest).toBe('g1')
    expect(token.startsWith(guestTokenPrefix)).toBe(true)
    const waited = await request('GET', { token })
    // Only the call's id and what the guest may send: nothing of the record, the workspace or who made the link.
    expect(await waited.json()).toEqual({ state: 'admitted', call: 'c1', publish: ['microphone'] })
    expect((await request('DELETE', { token })).status).toBe(204)
  })

  it('answers every link that lets nobody in the same way, and a bad name with 400', async () => {
    const { request } = lobby()
    const unknown = await request('POST', { body: { link: newToken(linkTokenPrefix), name: 'Eve' } })
    const garbage = await request('POST', { from: '5.6.7.8', body: { link: 'nope', name: 'Eve' } })
    expect([unknown.status, garbage.status]).toEqual([404, 404])
    expect((await unknown.json()).detail).toBe((await garbage.json()).detail)
    expect((await request('POST', { from: '9.9.9.9', body: { link, name: '' } })).status).toBe(400)
  })

  it('refuses a missing, malformed or unknown token with 401', async () => {
    const { request } = lobby()
    expect((await request('GET')).status).toBe(401)
    expect((await request('GET', { token: 'pbg_x' })).status).toBe(401)
    expect((await request('GET', { token: newToken(guestTokenPrefix) })).status).toBe(401)
    expect((await request('GET', { token: newToken(linkTokenPrefix) })).status).toBe(401)
  })

  it('lets an address enter a few times a minute, like the sign-in routes', async () => {
    const { request, guests } = lobby()
    for (let i = 0; i < entriesPerMinute; i++) expect((await request('POST', { body: { link, name: 'Eve' } })).status).toBe(201)
    const limited = await request('POST', { body: { link, name: 'Eve' } })
    expect(limited.status).toBe(429)
    expect(limited.headers.get('retry-after')).toBe('60')
    expect(guests.enter).toHaveBeenCalledTimes(entriesPerMinute)
    expect((await request('POST', { from: '5.6.7.8', body: { link, name: 'Eve' } })).status).toBe(201)
  })

  it('stops an address guessing tokens: after a few refused ones, even a valid token is 429 for the minute', async () => {
    const { request } = lobby()
    const { token } = (await (await request('POST', { from: '5.6.7.8', body: { link, name: 'Eve' } })).json()) as { token: string }
    for (let i = 0; i < refusalsPerMinute; i++) expect((await request('GET', { token: newToken(guestTokenPrefix) })).status).toBe(401)
    expect((await request('GET', { token })).status).toBe(429)
    expect((await request('POST', { body: { link, name: 'Eve' } })).status).toBe(429)
    expect((await request('GET', { from: '5.6.7.8', token })).status).toBe(200)
  })

  it('stops an address guessing links: each guess is refused, and after a few a minute the address is 429', async () => {
    const { request } = lobby()
    for (let i = 0; i < entriesPerMinute; i++) expect((await request('POST', { body: { link: newToken(linkTokenPrefix), name: 'Eve' } })).status).toBe(404)
    expect((await request('POST', { body: { link, name: 'Eve' } })).status).toBe(429)
  })
})
