import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TokenAuth } from '../../personal-mail/linked-accounts'
import { betterAuthConnectionAccounts } from '../../workflows/connections/connection-accounts'
import { connectionAuth } from './testing/connection-auth'
import { fakeOAuthServer } from './testing/fake-oauth-server'

const provider = 'workflow-acme-account'
let fake: Awaited<ReturnType<typeof fakeOAuthServer>>
beforeEach(async () => (fake = await fakeOAuthServer()))
afterEach(async () => {
  vi.restoreAllMocks()
  await fake.close()
})

// Ada connects her Acme account; the app then has her account's id.
const connected = async (options: Parameters<typeof connectionAuth>[1] = {}) => {
  const setup = await connectionAuth(fake.origin, options)
  const ada = await setup.browser('ada@example.com')
  const { url } = await ada.startConnect(provider)
  await ada.request(`/callback/${provider}?code=code-1&state=${url!.searchParams.get('state')}`)
  const accountId = String(setup.store.account!.find((account) => account.provider_id === provider)!.id)
  return { ...setup, ada, accountId }
}
const remaining = (store: Record<string, Record<string, unknown>[]>, id: string) => store.account!.some((account) => account.id === id)

describe('disconnecting a connected account', () => {
  it('revokes its refresh token at the provider, deletes it and tells the workflows, answering no token', async () => {
    const disconnected = vi.fn(async () => {})
    const { store, ada, accountId } = await connected({ listener: { disconnected } })
    const answer = await ada.request('/connections/disconnect', { method: 'POST', body: { accountId } })
    expect(JSON.parse(answer.text)).toEqual({ disconnected: true, revoked: true })
    expect(fake.callsTo('/revoke')).toEqual([expect.objectContaining({ form: expect.objectContaining({ token: 'snapshot-refresh_token-1', token_type_hint: 'refresh_token' }) })])
    expect(remaining(store, accountId)).toBe(false)
    expect(disconnected).toHaveBeenCalledWith(accountId)
  })

  it('still deletes it when the provider refuses the revocation or cannot be reached, logging nothing of it', async () => {
    const logged = [vi.spyOn(console, 'log'), vi.spyOn(console, 'error'), vi.spyOn(console, 'warn')]
    const { store, ada, accountId } = await connected()
    fake.answers['/revoke'] = 'revoke-error'
    expect(JSON.parse((await ada.request('/connections/disconnect', { method: 'POST', body: { accountId } })).text)).toEqual({ disconnected: true, revoked: false })
    expect(remaining(store, accountId)).toBe(false)

    const again = await connected()
    await fake.close()
    expect(JSON.parse((await again.ada.request('/connections/disconnect', { method: 'POST', body: { accountId: again.accountId } })).text)).toEqual({ disconnected: true, revoked: false })
    expect(remaining(again.store, again.accountId)).toBe(false)
    for (const spy of logged) for (const call of spy.mock.calls) expect(JSON.stringify(call)).not.toContain('snapshot-')
    fake = await fakeOAuthServer()
  })

  it("refuses someone else's account, one that is not there, no session and another site, keeping the account", async () => {
    const { store, browser, ada, accountId } = await connected({ checkOrigin: true })
    const grace = await browser('grace@example.com')
    const theirs = await grace.request('/connections/disconnect', { method: 'POST', body: { accountId } })
    const unknown = await grace.request('/connections/disconnect', { method: 'POST', body: { accountId: 'no-such-account' } })
    expect([theirs.response.status, unknown.response.status]).toEqual([404, 404])
    expect(theirs.text).toBe(unknown.text)
    expect((await ada.request('/connections/disconnect', { method: 'POST', body: { accountId }, cookies: false })).response.status).toBe(401)
    expect((await ada.request('/connections/disconnect', { method: 'POST', body: { accountId }, origin: 'https://evil.example' })).response.status).toBe(403)
    expect(remaining(store, accountId)).toBe(true)
    expect(fake.callsTo('/revoke')).toEqual([])
  })

  it('lists the connections with the accounts that fit them, never a token', async () => {
    const { ada, accountId } = await connected({ listener: { needsSignIn: async (ids) => ids } })
    const listed = JSON.parse((await ada.request('/connections')).text) as { connections: { key: string; accounts: { id: string; needs_sign_in: boolean }[] }[] }
    expect(listed.connections.map(({ key }) => key)).toEqual(['acme:account', 'acme:google'])
    expect(listed.connections[0]!.accounts).toEqual([expect.objectContaining({ id: accountId, needs_sign_in: true })])
    for (const answer of ada.answers) expect(answer).not.toContain('snapshot-')
  })
})

describe("a connected account's access token", () => {
  it('is refreshed once it expired, keeping a rotated refresh token and dropping the old one', async () => {
    const { auth, store, ada, accountId } = await connected()
    const accounts = betterAuthConnectionAccounts(auth as unknown as TokenAuth)
    const stored = store.account!.find((account) => account.id === accountId)!
    stored.access_token_expires_at = new Date(Date.now() - 1000)
    fake.answers['/token'] = 'token-refresh-rotated'
    expect(await accounts.accessToken(ada.user.id, accountId)).toBe('snapshot-access_token-3')
    expect(fake.callsTo('/token').at(-1)!.form).toMatchObject({ grant_type: 'refresh_token', refresh_token: 'snapshot-refresh_token-1' })
    for (const column of ['access_token', 'refresh_token']) expect(String(stored[column])).not.toMatch(/snapshot-/)

    stored.access_token_expires_at = new Date(Date.now() - 1000)
    fake.answers['/token'] = 'token-refresh'
    await accounts.accessToken(ada.user.id, accountId)
    expect(fake.callsTo('/token').at(-1)!.form).toMatchObject({ refresh_token: 'snapshot-refresh_token-2' })
  })

  it('is none once the provider refuses the refresh, which the step reads as a sign-in to renew', async () => {
    const { auth, store, ada, accountId } = await connected()
    store.account!.find((account) => account.id === accountId)!.access_token_expires_at = new Date(Date.now() - 1000)
    fake.answers['/token'] = 'token-refresh-invalid-grant'
    expect(await betterAuthConnectionAccounts(auth as unknown as TokenAuth).accessToken(ada.user.id, accountId)).toBeUndefined()
  })
})
