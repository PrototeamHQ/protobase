import { afterEach, describe, expect, it, vi } from 'vitest'
import { betterAuthAuthenticator } from '../src/better-auth/authenticator'
import { createAuth } from '../src/better-auth/create-auth'
import { createUser } from '../src/better-auth/users'
import { createAdmin } from '../src/create-admin'
import { openPostgresDatabase, postgresTemplateReady } from '../../../test-support/postgres-database'
import { startFakeOidcProvider } from './support/fake-oidc-provider'
import { client, issuer, octo, origin, password } from './support/platform-sign-in-app'

// Real Postgres, as the sign-ins run at the same time on connections of their own, which a recording cannot replay.
const ready = await postgresTemplateReady('auth')

afterEach(() => {
  vi.unstubAllGlobals()
})

const serve = async () => {
  const platform = await startFakeOidcProvider({ issuer, client })
  const store = await openPostgresDatabase('auth')
  const auth = createAuth({
    database: { dialect: store.dialect, type: 'postgres' },
    baseURL: origin,
    secret: 'test-secret-test-secret-test-secret-1234',
    mailer: false,
    operator: false,
    signInPerMinute: 100,
    signInProviders: [{ issuer, clientId: client.clientId, provider: 'central', tokenSignIn: true }],
  })
  await createUser(auth, { email: 'root@example.com', password })
  const app = createAdmin({ resources: [], db: store.db, authenticate: betterAuthAuthenticator({ auth }), auth })
  const postToken = (token: string) =>
    app.request(`${origin}/api/auth/sign-in/social`, { method: 'POST', headers: { 'content-type': 'application/json', origin }, body: JSON.stringify({ provider: 'central', idToken: { token } }) })
  const links = async () => (await store.db.selectFrom('account').select(['provider_id', 'account_id']).where('provider_id', '=', 'central').execute()) as { provider_id: string; account_id: string }[]
  return { auth, store, platform, postToken, links }
}

describe.skipIf(!ready)('first sign-ins at once', () => {
  it('link it once, and every one that signs in signs in the same person', async () => {
    const { auth, platform, postToken, links } = await serve()
    const octoId = (await createUser(auth, { email: 'octo@example.com', password, role: 'user' })).id
    const tokens = await Promise.all(Array.from({ length: 8 }, (_, index) => platform.idToken(octo({ jti: `token-${index}` }))))
    const answers = await Promise.all(tokens.map(postToken))
    expect(await links()).toEqual([{ provider_id: 'central', account_id: '4242' }])
    const signedIn = await Promise.all(answers.filter((answer) => answer.status === 200).map(async (answer) => ((await answer.json()) as { user: { id: string } }).user.id))
    expect(signedIn.length).toBeGreaterThan(0)
    expect(new Set(signedIn)).toEqual(new Set([octoId]))
  })

  it('link at most one of several subjects of the provider to one person, by the address', async () => {
    const { auth, platform, postToken, links } = await serve()
    await createUser(auth, { email: 'octo@example.com', password, role: 'user' })
    const tokens = await Promise.all(Array.from({ length: 8 }, (_, index) => platform.idToken(octo({ sub: `subject-${index}`, jti: `token-${index}` }))))
    const answers = await Promise.all(tokens.map(postToken))
    const linked = await links()
    expect(linked.length).toBeLessThanOrEqual(1)
    expect(answers.filter((answer) => answer.status === 200)).toHaveLength(linked.length)
  })

  it('cannot leave two accounts with one provider and account id in the store', async () => {
    const { auth, store } = await serve()
    const octoId = (await createUser(auth, { email: 'octo@example.com', password, role: 'user' })).id
    const insert = (id: string) => store.exec(`insert into account (id, account_id, provider_id, user_id, updated_at) values ('${id}', '4242', 'central', '${octoId}', now())`)
    await insert('link-1')
    await expect(insert('link-2')).rejects.toThrow(/account_provider_id_account_id_uidx/)
  })

  it('cannot leave two accounts of a provider that links one for one person in the store', async () => {
    const { auth, store } = await serve()
    const octoId = (await createUser(auth, { email: 'octo@example.com', password, role: 'user' })).id
    const insert = (id: string, subject: string) => store.exec(`insert into account (id, account_id, provider_id, user_id, single_subject_user_id, updated_at) values ('${id}', '${subject}', 'central', '${octoId}', '${octoId}', now())`)
    await insert('link-1', 'subject-1')
    await expect(insert('link-2', 'subject-2')).rejects.toThrow(/account_provider_id_single_subject_user_id_uidx/)
  })
})
