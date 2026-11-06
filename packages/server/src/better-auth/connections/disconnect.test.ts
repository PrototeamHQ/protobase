import { symmetricDecrypt } from 'better-auth/crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Unrevoked } from './connection-events'
import { revokeToken } from './revoke-token'
import type { TokenAuth } from '../../personal-mail/linked-accounts'
import { betterAuthConnectionAccounts } from '../../workflows/connections/connection-accounts'
import { acmeClient, connectionAuth } from './testing/connection-auth'
import { fakeOAuthServer } from './testing/fake-oauth-server'

// The provider's revocation as it is, unless a test makes it throw.
vi.mock('./revoke-token', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./revoke-token')>()
  return { revokeToken: vi.fn(actual.revokeToken) }
})

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
    expect(JSON.parse(answer.text)).toEqual({ disconnected: true, revocation: 'revoked' })
    expect(fake.callsTo('/revoke')).toEqual([expect.objectContaining({ form: expect.objectContaining({ token: 'snapshot-refresh_token-1', token_type_hint: 'refresh_token' }) })])
    expect(remaining(store, accountId)).toBe(false)
    expect(disconnected).toHaveBeenCalledWith(accountId)
  })

  it('still deletes it when the provider refuses the revocation or cannot be reached, logging nothing of it', async () => {
    const logged = [vi.spyOn(console, 'log'), vi.spyOn(console, 'error'), vi.spyOn(console, 'warn')]
    const { store, ada, accountId } = await connected()
    fake.answers['/revoke'] = 'revoke-error'
    expect(JSON.parse((await ada.request('/connections/disconnect', { method: 'POST', body: { accountId } })).text)).toEqual({ disconnected: true, revocation: 'queued' })
    expect(remaining(store, accountId)).toBe(false)

    const again = await connected()
    await fake.close()
    expect(JSON.parse((await again.ada.request('/connections/disconnect', { method: 'POST', body: { accountId: again.accountId } })).text)).toEqual({ disconnected: true, revocation: 'queued' })
    expect(remaining(again.store, again.accountId)).toBe(false)
    for (const spy of logged) for (const call of spy.mock.calls) expect(JSON.stringify(call)).not.toContain('snapshot-')
    fake = await fakeOAuthServer()
  })

  it('queues a token the provider did not revoke, encrypted with the app secret, and only that once', async () => {
    const revokeLater = vi.fn(async () => {})
    const { auth, ada, accountId } = await connected({ listener: { revokeLater } })
    fake.answers['/revoke'] = 'revoke-error'
    await ada.request('/connections/disconnect', { method: 'POST', body: { accountId } })
    expect(revokeLater).toHaveBeenCalledTimes(1)
    const queued = (revokeLater.mock.calls[0] as unknown as [{ provider: string; hint: string; token: string }])[0]
    expect(queued).toMatchObject({ provider, hint: 'refresh_token' })
    expect(queued.token).not.toContain('snapshot-')
    expect(await symmetricDecrypt({ key: (await auth.$context).secretConfig, data: queued.token })).toBe('snapshot-refresh_token-1')

    expect((await ada.request('/connections/disconnect', { method: 'POST', body: { accountId } })).response.status).toBe(404)
    expect(revokeLater).toHaveBeenCalledTimes(1)
  })

  it('queues nothing once the provider revoked the token', async () => {
    const revokeLater = vi.fn(async () => {})
    const { ada, accountId } = await connected({ listener: { revokeLater } })
    await ada.request('/connections/disconnect', { method: 'POST', body: { accountId } })
    expect(revokeLater).not.toHaveBeenCalled()
  })

  it('refuses before revoking or deleting anything while no workflows listen to queue a revocation', async () => {
    const { store, ada, accountId } = await connected({ listener: false })
    const answer = await ada.request('/connections/disconnect', { method: 'POST', body: { accountId } })
    expect(answer.response.status).toBe(503)
    expect(remaining(store, accountId)).toBe(true)
    expect(fake.callsTo('/revoke')).toEqual([])
  })

  it('deletes the account when the revocation it did not take cannot be queued, answering it not revoked and reporting why', async () => {
    const unrevoked = vi.fn((_failure: Unrevoked) => {})
    const revokeLater = vi.fn(async () => {
      throw new Error('queue down')
    })
    const { store, ada, accountId } = await connected({ listener: { revokeLater, unrevoked } })
    fake.answers['/revoke'] = 'revoke-error'
    const answer = await ada.request('/connections/disconnect', { method: 'POST', body: { accountId } })
    expect(JSON.parse(answer.text)).toEqual({ disconnected: true, revocation: 'not_revoked' })
    expect(remaining(store, accountId)).toBe(false)
    expect(unrevoked.mock.calls).toEqual([[{ provider, reason: 'queue_failed' }]])
  })

  it('deletes an account whose stored token does not decrypt without calling the provider, answering it not revoked', async () => {
    const unrevoked = vi.fn((_failure: Unrevoked) => {})
    const disconnected = vi.fn(async () => {})
    const { store, ada, accountId } = await connected({ listener: { unrevoked, disconnected } })
    store.account!.find((account) => account.id === accountId)!.refresh_token = '$ba$99$00ff00ff'
    const answer = await ada.request('/connections/disconnect', { method: 'POST', body: { accountId } })
    expect(JSON.parse(answer.text)).toEqual({ disconnected: true, revocation: 'not_revoked' })
    expect(remaining(store, accountId)).toBe(false)
    expect(disconnected).toHaveBeenCalledWith(accountId)
    expect(fake.callsTo('/revoke')).toEqual([])
    expect(unrevoked.mock.calls).toEqual([[{ provider, reason: 'unreadable' }]])
    expect(answer.text).not.toContain('$ba$')
  })

  it('deletes the account and queues its token when the revocation throws, saying nothing of the error', async () => {
    vi.mocked(revokeToken).mockRejectedValueOnce(new TypeError('snapshot-refresh_token-1 broke the request'))
    const unrevoked = vi.fn((_failure: Unrevoked) => {})
    const revokeLater = vi.fn(async () => {})
    const { store, ada, accountId } = await connected({ listener: { unrevoked, revokeLater } })
    const answer = await ada.request('/connections/disconnect', { method: 'POST', body: { accountId } })
    expect(JSON.parse(answer.text)).toEqual({ disconnected: true, revocation: 'queued' })
    expect(remaining(store, accountId)).toBe(false)
    expect(revokeLater).toHaveBeenCalledTimes(1)
    expect(unrevoked.mock.calls).toEqual([[{ provider, reason: 'revoke_failed' }]])
  })

  it('keeps the account, revoking nothing, when its triggers cannot be stopped, and disconnecting again finishes it', async () => {
    const disconnected = vi.fn(async () => {})
    disconnected.mockRejectedValueOnce(new Error('database down'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { store, ada, accountId } = await connected({ listener: { disconnected } })
    const failed = await ada.request('/connections/disconnect', { method: 'POST', body: { accountId } })
    expect(failed.response.status).toBe(500)
    expect(failed.text).not.toContain('disconnected')
    expect(remaining(store, accountId)).toBe(true)
    expect(fake.callsTo('/revoke')).toEqual([])

    const again = await ada.request('/connections/disconnect', { method: 'POST', body: { accountId } })
    expect(JSON.parse(again.text)).toEqual({ disconnected: true, revocation: 'revoked' })
    expect(remaining(store, accountId)).toBe(false)
    expect(disconnected).toHaveBeenCalledTimes(2)
  })

  it('answers the error when the account cannot be deleted, its triggers already stopped, and disconnecting again finishes it', async () => {
    const disconnected = vi.fn(async () => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { auth, store, ada, accountId } = await connected({ listener: { disconnected } })
    vi.spyOn((await auth.$context).internalAdapter, 'deleteAccount').mockRejectedValueOnce(new Error('database down'))
    expect((await ada.request('/connections/disconnect', { method: 'POST', body: { accountId } })).response.status).toBe(500)
    expect(remaining(store, accountId)).toBe(true)
    expect(disconnected).toHaveBeenCalledWith(accountId)

    expect(JSON.parse((await ada.request('/connections/disconnect', { method: 'POST', body: { accountId } })).text)).toEqual({ disconnected: true, revocation: 'revoked' })
    expect(remaining(store, accountId)).toBe(false)
  })

  it('leaves no token for a workflow once it answered', async () => {
    const { auth, ada, accountId } = await connected()
    await ada.request('/connections/disconnect', { method: 'POST', body: { accountId } })
    expect(await betterAuthConnectionAccounts(auth as unknown as TokenAuth).find(String(ada.user.id), accountId)).toBeUndefined()
  })

  it('disconnects it for someone who signs in without a linked account, as with a passkey, since it never signs in', async () => {
    const { store, ada, accountId } = await connected()
    store.account = store.account!.filter((account) => account.provider_id !== 'credential')
    expect(JSON.parse((await ada.request('/connections/disconnect', { method: 'POST', body: { accountId } })).text)).toEqual({ disconnected: true, revocation: 'revoked' })
    expect(remaining(store, accountId)).toBe(false)
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

  it('refuses in the language the request asks for, keeping the code', async () => {
    const { ada } = await connected()
    const dutch = await ada.request('/connections/disconnect', { method: 'POST', body: { accountId: 'no-such-account' }, language: 'nl-NL,nl;q=0.9' })
    expect(JSON.parse(dutch.text)).toMatchObject({ code: 'CONNECTION_NOT_FOUND', message: 'Je hebt geen gekoppeld account met deze id.' })
    const english = await ada.request('/connections/disconnect', { method: 'POST', body: { accountId: 'no-such-account' } })
    expect(JSON.parse(english.text)).toMatchObject({ code: 'CONNECTION_NOT_FOUND', message: 'You have no connected account with this id.' })
  })

  it('lists the connections with the accounts that fit them and the workflows that use them, never a token', async () => {
    const uses = vi.fn(async (_userId: string, ids: string[]) => Object.fromEntries(ids.map((id) => [id, [{ id: 'wf-1', name: 'Report' }]])))
    const { ada, accountId } = await connected({ listener: { needsSignIn: async (ids) => ids, uses } })
    const listed = JSON.parse((await ada.request('/connections')).text) as { connections: { key: string; accounts: Record<string, unknown>[] }[] }
    expect(listed.connections.map(({ key }) => key)).toEqual(['acme:account', 'acme:google'])
    expect(listed.connections[0]!.accounts).toEqual([{ id: accountId, scopes: expect.arrayContaining(['openid']), created_at: expect.any(String), needs_sign_in: true, used_by: [{ id: 'wf-1', name: 'Report' }] }])
    expect(uses).toHaveBeenCalledExactlyOnceWith(String(ada.user.id), [accountId])
    for (const answer of ada.answers) for (const secret of ['snapshot-', acmeClient.clientSecret]) expect(answer).not.toContain(secret)
  })

  it("lists only the signed-in person's own accounts, and none without a session", async () => {
    const { browser, ada, accountId } = await connected()
    const grace = await browser('grace@example.com')
    const listed = JSON.parse((await grace.request('/connections')).text) as { connections: { accounts: unknown[] }[] }
    expect(listed.connections.flatMap(({ accounts }) => accounts)).toEqual([])
    const without = await ada.request('/connections', { cookies: false })
    expect(without.response.status).toBe(401)
    expect(without.text).not.toContain(accountId)
    expect(without.text).not.toContain('connections')
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

  it('throws once the provider cannot be reached, so the step tries again rather than asking for a new sign-in', async () => {
    const { auth, store, ada, accountId } = await connected()
    store.account!.find((account) => account.id === accountId)!.access_token_expires_at = new Date(Date.now() - 1000)
    await fake.close()
    await expect(betterAuthConnectionAccounts(auth as unknown as TokenAuth).accessToken(ada.user.id, accountId)).rejects.toMatchObject({ body: { code: 'FAILED_TO_GET_ACCESS_TOKEN' } })
    fake = await fakeOAuthServer()
  })
})
