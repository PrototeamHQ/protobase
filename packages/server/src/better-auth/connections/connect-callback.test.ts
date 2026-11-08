import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { acmeClient, connectionAuth } from './testing/connection-auth'
import { fakeOAuthServer } from './testing/fake-oauth-server'

const provider = 'workflow-acme-account'
let fake: Awaited<ReturnType<typeof fakeOAuthServer>>
beforeEach(async () => (fake = await fakeOAuthServer()))
afterEach(async () => {
  vi.useRealTimers()
  await fake.close()
})

const accountsOf = (store: Record<string, Record<string, unknown>[]>) => store.account!.filter((account) => account.provider_id === provider)
const tokens = ['snapshot-access_token-1', 'snapshot-refresh_token-1']

describe('connecting an account through a connection of its own provider', () => {
  it('sends a PKCE challenge, and the callback of the flow this browser started stores the tokens encrypted', async () => {
    const { store, browser } = await connectionAuth(fake.origin)
    const ada = await browser('ada@example.com')
    const { url } = await ada.startConnect(provider)
    expect(url!.origin + url!.pathname).toBe(`${fake.origin}/authorize`)
    expect(url!.searchParams.get('code_challenge_method')).toBe('S256')
    expect(url!.searchParams.get('scope')).toContain('openid')
    const callback = await ada.request(`/callback/${provider}?code=code-1&state=${url!.searchParams.get('state')}`)
    expect(callback.response.headers.get('location')).toBe('/account')
    const [stored] = accountsOf(store)
    expect(stored).toMatchObject({ user_id: ada.user.id, scope: expect.stringContaining('gmail.readonly') })
    for (const column of ['access_token', 'refresh_token']) for (const token of tokens) expect(String(stored![column])).not.toContain(token)
    // The code went to the token endpoint once, with this flow's verifier and the app's client.
    expect(fake.callsTo('/token')).toEqual([expect.objectContaining({ form: expect.objectContaining({ code: 'code-1', code_verifier: expect.any(String), client_id: acmeClient.clientId }) })])
    for (const answer of ada.answers) for (const value of [...tokens, acmeClient.clientSecret]) expect(answer).not.toContain(value)
  })

  it("refuses a callback in another browser than the one that started it, linking the account to neither person", async () => {
    const { store, browser } = await connectionAuth(fake.origin)
    const attacker = await browser('mallory@example.com')
    const victim = await browser('ada@example.com')
    const { url } = await attacker.startConnect(provider)
    const callback = await victim.request(`/callback/${provider}?code=code-1&state=${url!.searchParams.get('state')}`)
    expect(callback.response.headers.get('location')).toMatch(/error=/)
    expect(accountsOf(store)).toEqual([])
    expect(fake.callsTo('/token')).toEqual([])
  })

  it('refuses a callback without a state, with a state no flow started, and one replayed, exchanging each code at most once', async () => {
    const { store, browser } = await connectionAuth(fake.origin)
    const ada = await browser('ada@example.com')
    expect((await ada.request(`/callback/${provider}?code=code-1`)).response.headers.get('location')).toMatch(/error=state_not_found/)
    await ada.startConnect(provider)
    expect((await ada.request(`/callback/${provider}?code=code-1&state=made-up-state`)).response.headers.get('location')).toMatch(/error=/)
    expect(accountsOf(store)).toEqual([])

    const { url } = await ada.startConnect(provider)
    const state = url!.searchParams.get('state')
    await ada.request(`/callback/${provider}?code=code-2&state=${state}`)
    const replay = await ada.request(`/callback/${provider}?code=code-2&state=${state}`)
    expect(replay.response.headers.get('location')).toMatch(/error=/)
    expect(accountsOf(store)).toHaveLength(1)
    expect(fake.callsTo('/token')).toHaveLength(1)
  })

  it('refuses a callback once the flow is older than ten minutes', async () => {
    const { store, browser } = await connectionAuth(fake.origin)
    const ada = await browser('ada@example.com')
    const { url } = await ada.startConnect(provider)
    vi.useFakeTimers({ toFake: ['Date'], now: Date.now() + 11 * 60 * 1000 })
    const callback = await ada.request(`/callback/${provider}?code=code-1&state=${url!.searchParams.get('state')}`)
    expect(callback.response.headers.get('location')).toMatch(/error=/)
    expect(accountsOf(store)).toEqual([])
  })

  it('answers a provider that refused with the app page and a code, connecting nothing and exchanging nothing', async () => {
    const { store, browser } = await connectionAuth(fake.origin)
    const ada = await browser('ada@example.com')
    const { url } = await ada.startConnect(provider)
    const callback = await ada.request(`/callback/${provider}?error=access_denied&state=${url!.searchParams.get('state')}`)
    expect(callback.response.headers.get('location')).toMatch(/^\/account\?error=access_denied/)
    expect(accountsOf(store)).toEqual([])
    expect(fake.callsTo('/token')).toEqual([])
  })

  it('refuses a return address on another site', async () => {
    const { browser } = await connectionAuth(fake.origin, { checkOrigin: true })
    const ada = await browser('ada@example.com')
    for (const body of [{ callbackURL: 'https://evil.example/steal' }, { errorCallbackURL: 'https://evil.example/steal' }]) expect((await ada.startConnect(provider, body)).start.response.status).toBe(403)
  })

  it('never signs anyone in through a provider only connections use, nor signs them up', async () => {
    const { store, auth } = await connectionAuth(fake.origin)
    const visitor = await auth.handler(new Request('https://admin.example.com/api/auth/sign-in/social', { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://admin.example.com' }, body: JSON.stringify({ provider, callbackURL: '/' }) }))
    expect(visitor.status).toBe(403)
    expect(await visitor.text()).toContain('CONNECTION_NOT_SIGN_IN')
    expect(store.session).toEqual([])
  })
})
