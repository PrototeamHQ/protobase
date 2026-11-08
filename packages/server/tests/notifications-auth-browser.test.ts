import { describe, expect, it, vi } from 'vitest'
import { devicesPath } from '../src/notifications/paths'
import { browser, origin, password, pushTo, serve } from './support/notifications-app'

// Real scrypt hashing runs on this thread, CPU work a busy machine stretches past 5 s.
vi.setConfig({ testTimeout: 30_000 })

describe('browser push with auth', () => {
  it('reaches a browser only while the session it was registered in stands', async () => {
    const served = await serve()
    const { alice, cookieOf, register, post, devicesOf, app } = served
    const cookie = await cookieOf('alice@example.com')
    const token = ((await (await app.request(`${origin}/api/auth/token`, { headers: { cookie, origin } })).json()) as { token: string }).token
    expect((await register(token, browser('alice-browser'))).status).toBe(200)
    expect(await pushTo(served, alice.id)).toEqual(['alice-browser'])
    expect((await post('/api/auth/sign-out', {}, { cookie })).status).toBe(200)
    expect(await pushTo(served, alice.id)).toEqual([])
    expect(await devicesOf(alice.id)).toEqual([])
  })

  it("ends the session a browser held when someone signs in over its cookie, and with it that session's devices", async () => {
    const served = await serve()
    const { alice, bob, cookieOf, register, post, devicesOf, app, tokenOf } = served
    const aliceCookie = await cookieOf('alice@example.com')
    const token = ((await (await app.request(`${origin}/api/auth/token`, { headers: { cookie: aliceCookie, origin } })).json()) as { token: string }).token
    expect((await register(token, browser('shared-browser'))).status).toBe(200)
    // Bob signs in on the same browser without Alice signing out first.
    const bobSignIn = await post('/api/auth/sign-in/email', { email: 'bob@example.com', password }, { cookie: aliceCookie })
    expect(bobSignIn.status).toBe(200)
    expect((await app.request(`${origin}/api/auth/token`, { headers: { cookie: aliceCookie, origin } })).status).toBe(401)
    expect(await pushTo(served, alice.id)).toEqual([])
    expect(await devicesOf(alice.id)).toEqual([])
    // Bob, holding the browser now, registers it afresh as his own.
    expect((await register(await tokenOf('bob@example.com'), browser('bob-browser'))).status).toBe(200)
    expect(await pushTo(served, bob.id)).toEqual(['bob-browser'])
  })

  it('refuses cross-site requests that carry only the cookie, and gives a foreign page no token to read', async () => {
    const { app, alice, cookieOf, register, tokenOf, devicesOf } = await serve()
    const own = await (await register(await tokenOf('alice@example.com'), browser('alice-browser'))).json()
    const cookie = await cookieOf('alice@example.com')
    const evil = 'https://evil.example'
    const cookieOnly = [
      { 'content-type': 'application/x-www-form-urlencoded', body: 'kind=web&endpoint=https%3A%2F%2Ffcm.googleapis.com%2Ffcm%2Fsend%2Fattacker' },
      { 'content-type': 'text/plain', body: JSON.stringify(browser('attacker')) },
      { 'content-type': 'application/json', body: JSON.stringify(browser('attacker')) },
    ]
    for (const { body, ...headers } of cookieOnly) {
      const answer = await app.request(`${origin}${devicesPath('/api')}`, { method: 'POST', headers: { ...headers, cookie, origin: evil }, body })
      expect(answer.status).toBe(401)
    }
    expect((await app.request(`${origin}${devicesPath('/api', own.id)}`, { method: 'DELETE', headers: { cookie, origin: evil } })).status).toBe(401)
    expect(await devicesOf(alice.id)).toEqual([{ token: 'https://fcm.googleapis.com/fcm/send/alice-browser' }])
    // The token the cookie buys is the boundary: no CORS answer lets a foreign page read it.
    const read = await app.request(`${origin}/api/auth/token`, { headers: { cookie, origin: evil } })
    const preflight = await app.request(`${origin}/api/auth/token`, { method: 'OPTIONS', headers: { origin: evil, 'access-control-request-method': 'GET' } })
    for (const answer of [read, preflight]) {
      expect(answer.headers.get('access-control-allow-origin')).toBeNull()
      expect(answer.headers.get('access-control-allow-credentials')).toBeNull()
    }
  })
})
