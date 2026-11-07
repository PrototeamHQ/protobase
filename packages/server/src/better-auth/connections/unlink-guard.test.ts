import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { connectionAuth } from './testing/connection-auth'
import { fakeOAuthServer } from './testing/fake-oauth-server'

const gmail = 'https://www.googleapis.com/auth/gmail.readonly'
let fake: Awaited<ReturnType<typeof fakeOAuthServer>>
beforeEach(async () => (fake = await fakeOAuthServer()))
afterEach(async () => {
  vi.restoreAllMocks()
  await fake.close()
})

// Ada with an Acme connection, a Google account holding Gmail's scope, and one that only signs her in.
const setup = async () => {
  const disconnected = vi.fn(async () => {})
  const auth = await connectionAuth(fake.origin, { listener: { disconnected } })
  const ada = await auth.browser('ada@example.com')
  const { url } = await ada.startConnect('workflow-acme-account')
  await ada.request(`/callback/workflow-acme-account?code=code-1&state=${url!.searchParams.get('state')}`)
  const acme = auth.store.account!.find((account) => account.provider_id === 'workflow-acme-account')!
  const google = (id: string, scope: string) => {
    const row = { ...acme, id, provider_id: 'google', account_id: `google-${id}`, scope }
    auth.store.account!.push(row)
    return row
  }
  return { ...auth, ada, disconnected, acme, gmail: google('google-gmail', `openid,${gmail}`), plain: google('google-plain', 'openid,email') }
}
const unlink = (browser: Awaited<ReturnType<typeof setup>>['ada'], accountId: unknown) => browser.request('/unlink-account', { method: 'POST', body: accountId === undefined ? {} : { accountId } })
const ids = (store: Record<string, Record<string, unknown>[]>) => store.account!.map((account) => account.id)

describe("Better Auth's own unlinking", () => {
  it('refuses a connected account, of a provider of its own or a sign-in provider holding its scopes, keeping it and its token', async () => {
    const { store, ada, acme, gmail: google, disconnected } = await setup()
    const before = structuredClone(store.account)
    for (const account of [acme, google]) {
      const answer = await unlink(ada, account.id)
      expect(answer.response.status).toBe(403)
      expect(JSON.parse(answer.text)).toMatchObject({ code: 'CONNECTION_UNLINK_REFUSED' })
    }
    expect(store.account).toEqual(before)
    expect(disconnected).not.toHaveBeenCalled()
    expect(fake.callsTo('/revoke')).toEqual([])
  })

  it('still unlinks an account that only signs in', async () => {
    const { store, ada, plain } = await setup()
    expect((await unlink(ada, plain.id)).response.status).toBe(200)
    expect(ids(store)).not.toContain(plain.id)
  })

  it("answers someone else's connected account as one that is not there, keeping it", async () => {
    const { store, browser, acme } = await setup()
    const grace = await browser('grace@example.com')
    const theirs = await unlink(grace, acme.id)
    const unknown = await unlink(grace, 'no-such-account')
    expect(theirs.response.status).toBe(unknown.response.status)
    expect(theirs.text).toBe(unknown.text)
    expect(theirs.text).not.toContain('Connections')
    expect(ids(store)).toContain(acme.id)
  })

  it('unlinks nothing without an account id, or when the accounts cannot be read', async () => {
    const { auth, store, ada, acme } = await setup()
    expect((await unlink(ada, undefined)).response.status).toBe(400)
    const internal = (await auth.$context).internalAdapter
    vi.spyOn(internal, 'findAccounts').mockRejectedValue(new Error('store down'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect((await unlink(ada, acme.id)).response.status).toBeGreaterThanOrEqual(400)
    expect(ids(store)).toContain(acme.id)
  })
})
