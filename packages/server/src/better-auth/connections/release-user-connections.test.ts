import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { deleteUser } from '../users'
import { connectionAuth } from './testing/connection-auth'
import { fakeOAuthServer } from './testing/fake-oauth-server'

const provider = 'workflow-acme-account'
let fake: Awaited<ReturnType<typeof fakeOAuthServer>>
beforeEach(async () => (fake = await fakeOAuthServer()))
afterEach(async () => {
  vi.restoreAllMocks()
  await fake.close()
})

// Ada connects her Acme account, and Root, an admin, may remove her.
const connected = async (options: Parameters<typeof connectionAuth>[1] = {}) => {
  const setup = await connectionAuth(fake.origin, options)
  const ada = await setup.browser('ada@example.com')
  const root = await setup.browser('root@example.com', 'admin')
  const { url } = await ada.startConnect(provider)
  await ada.request(`/callback/${provider}?code=code-1&state=${url!.searchParams.get('state')}`)
  const accountId = String(setup.store.account!.find((account) => account.provider_id === provider)!.id)
  return { ...setup, ada, root, accountId }
}
const ownAccounts = (store: Record<string, Record<string, unknown>[]>, userId: unknown) => store.account!.filter((account) => account.user_id === userId)
const userLeft = (store: Record<string, Record<string, unknown>[]>, userId: unknown) => store.user!.some((user) => user.id === userId)

describe("deleting a user with a connected account", () => {
  it('revokes its refresh token at the provider and parks its triggers before the account goes', async () => {
    const disconnected = vi.fn(async () => {})
    const { store, ada, root, accountId } = await connected({ listener: { disconnected } })
    expect((await root.request('/admin/remove-user', { method: 'POST', body: { userId: ada.user.id } })).response.status).toBe(200)
    expect(fake.callsTo('/revoke')).toEqual([expect.objectContaining({ form: expect.objectContaining({ token: 'snapshot-refresh_token-1', token_type_hint: 'refresh_token' }) })])
    expect(disconnected).toHaveBeenCalledExactlyOnceWith(accountId)
    expect(ownAccounts(store, ada.user.id)).toEqual([])
  })

  it('queues a sealed revocation when the provider does not take it', async () => {
    const revokeLater = vi.fn(async (_revocation: { provider: string; hint: string; token: string }) => {})
    const { ada } = await connected({ listener: { revokeLater } })
    fake.answers['/revoke'] = 'revoke-error'
    await ada.request('/delete-user', { method: 'POST', body: { password: 'correct horse battery' } })
    expect(revokeLater).toHaveBeenCalledTimes(1)
    expect(revokeLater.mock.calls[0]![0]).toMatchObject({ provider, hint: 'refresh_token' })
    expect(revokeLater.mock.calls[0]![0].token).not.toContain('snapshot-')
  })

  it('revokes nothing for a user with only sign-in accounts', async () => {
    const disconnected = vi.fn(async () => {})
    const { store, browser, auth, deletion } = await connectionAuth(fake.origin, { listener: { disconnected } })
    const grace = await browser('grace@example.com')
    await browser('root@example.com', 'admin')
    await deleteUser(Object.assign(auth, { userDeletion: deletion, mcp: undefined }) as never, 'grace@example.com')
    expect(userLeft(store, grace.user.id)).toBe(false)
    expect(fake.callsTo('/revoke')).toEqual([])
    expect(disconnected).not.toHaveBeenCalled()
  })

  it('reaches the listener whichever way the user is deleted: by an admin, by themselves or by deleteUser', async () => {
    for (const remove of ['admin', 'self', 'host'] as const) {
      const disconnected = vi.fn(async () => {})
      const { auth, deletion, store, ada, root, accountId } = await connected({ listener: { disconnected } })
      if (remove === 'admin') await root.request('/admin/remove-user', { method: 'POST', body: { userId: ada.user.id } })
      if (remove === 'self') await ada.request('/delete-user', { method: 'POST', body: { password: 'correct horse battery' } })
      if (remove === 'host') await deleteUser(Object.assign(auth, { userDeletion: deletion, mcp: undefined }) as never, 'ada@example.com')
      expect([remove, userLeft(store, ada.user.id), disconnected.mock.calls]).toEqual([remove, false, [[accountId]]])
    }
  })

  it('leaves the user and their accounts in place, revoking nothing, while no workflows listen to queue a revocation', async () => {
    const { store, ada, root } = await connected({ listener: false })
    const before = ownAccounts(store, ada.user.id).length
    const answer = await root.request('/admin/remove-user', { method: 'POST', body: { userId: ada.user.id } })
    expect(answer.response.status).toBe(503)
    expect(JSON.parse(answer.text)).toMatchObject({ code: 'CONNECTIONS_STARTING' })
    expect(userLeft(store, ada.user.id)).toBe(true)
    expect(ownAccounts(store, ada.user.id)).toHaveLength(before)
    expect(fake.callsTo('/revoke')).toEqual([])
  })

  it('leaves the user and their accounts in place when the triggers cannot be parked, and deleting again finishes it', async () => {
    const disconnected = vi.fn(async () => {})
    disconnected.mockRejectedValueOnce(new Error('database down'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { store, ada, root, accountId } = await connected({ listener: { disconnected } })
    expect((await root.request('/admin/remove-user', { method: 'POST', body: { userId: ada.user.id } })).response.status).toBe(500)
    expect(userLeft(store, ada.user.id)).toBe(true)
    expect(ownAccounts(store, ada.user.id).map(({ id }) => id)).toContain(accountId)
    expect(fake.callsTo('/revoke')).toEqual([])

    expect((await root.request('/admin/remove-user', { method: 'POST', body: { userId: ada.user.id } })).response.status).toBe(200)
    expect(userLeft(store, ada.user.id)).toBe(false)
    expect(fake.callsTo('/revoke')).toHaveLength(1)
  })
})
