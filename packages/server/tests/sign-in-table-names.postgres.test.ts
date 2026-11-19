import { Kysely } from 'kysely'
import { describe, expect, it, vi } from 'vitest'
import { authSchemaMigration, checkAuthSchema } from '../src/better-auth/auth-schema'
import { appAuthOptions } from '../src/better-auth/auth-settings'
import { betterAuthAuthenticator } from '../src/better-auth/authenticator'
import { buildAuth } from '../src/better-auth/create-auth'
import { liveSessions } from '../src/better-auth/live-sessions'
import { resolveNames, type TableNames } from '../src/better-auth/names/resolve-names'
import { createOrganization, listOrganizations } from '../src/better-auth/organizations/host'
import { readSignInPolicy, saveSignInPolicy } from '../src/better-auth/policy-store'
import { defaultSignInPolicy } from '../src/better-auth/sign-in-policy'
import { endStaffSignIn, listStaffSignIns, logStaffSignIn } from '../src/better-auth/staff-log'
import { authSchemaDrift } from '../src/better-auth/store/drift'
import { createUser, listUsers } from '../src/better-auth/users'
import { openPostgresDatabase, postgresTemplateReady } from '../../../test-support/postgres-database'

// The store with every built-in table and column under another name, through createAuth's `tables` alone: its migrations make
// them so, and sign-in, sessions, tokens, memberships and the store's own SQL read and write them so.
vi.setConfig({ testTimeout: 30_000 })

const ready = await postgresTemplateReady('empty')

const password = 'correct-horse-battery-staple'
const baseURL = 'http://localhost:5173'

// Each table with `t_` before its name, each column with `c_`.
const tables = Object.fromEntries(
  Object.values(resolveNames({ schema: undefined }).tables).map(({ internal, columns }) => [internal, { name: `t_${internal}`, columns: Object.fromEntries(Object.keys(columns).map((column) => [column, `c_${column}`])) }]),
) as TableNames

const serve = async () => {
  const store = await openPostgresDatabase('empty')
  const db = new Kysely<any>({ dialect: store.dialect })
  const auth = await buildAuth({ ...appAuthOptions({ baseURL, secret: 'table-names-test-secret-0123456789', schema: 'login', mailer: false, organizations: true, personalAccessTokens: { prefix: 'test_' } }, { db }), tables })
  await store.exec((await authSchemaMigration(auth))!)
  const request = (path: string, init: { cookie?: string; body?: unknown } = {}) =>
    auth.handler(
      new Request(`${baseURL}${path}`, {
        method: init.body === undefined ? 'GET' : 'POST',
        headers: { origin: baseURL, ...(init.body !== undefined && { 'content-type': 'application/json' }), ...(init.cookie && { cookie: init.cookie }) },
        ...(init.body !== undefined && { body: JSON.stringify(init.body) }),
      }),
    )
  const authenticate = betterAuthAuthenticator({ auth })
  const bearer = (token: string) => authenticate(new Request(`${baseURL}/api/v1/orders`, { headers: { authorization: `Bearer ${token}` } }))
  return { store, auth, request, bearer }
}

describe.skipIf(!ready)('the auth store with every table and column renamed', () => {
  it('is made under those names, and matches what Better Auth reads', async () => {
    const { store, auth } = await serve()
    await expect(checkAuthSchema(auth)).resolves.toBeUndefined()
    expect(await authSchemaDrift(auth)).toEqual([])
    const { rows } = await store.pool().query<{ name: string }>(
      "select table_name || '.' || column_name as name from information_schema.columns where table_schema = 'login' and (column_name !~ '^c_' and column_name <> 'id' or table_name !~ '^t_')",
    )
    expect(rows).toEqual([])
    const indexes = await store.pool().query<{ name: string }>("select indexname as name from pg_indexes where schemaname = 'login' and indexname like '%_idx' and indexname !~ '^t_'")
    expect(indexes.rows).toEqual([])
  })

  it('signs a member of an organization in, with a session, a token and a personal access token', async () => {
    const { store, auth, request, bearer } = await serve()
    const user = await createUser(auth, { email: 'ana@example.com', password, name: 'Ana' })
    const { organization } = await createOrganization(auth, { name: 'Acme', slug: 'acme', owner: 'ana@example.com' })
    const signedIn = await request('/api/auth/sign-in/email', { body: { email: 'ana@example.com', password } })
    expect(signedIn.status, await signedIn.clone().text()).toBe(200)
    const cookie = signedIn.headers.getSetCookie().map((line) => line.split(';')[0]).join('; ')
    const session = (await (await request('/api/auth/get-session', { cookie })).json()) as { user: { id: string }; session: { id: string } }
    expect(session.user.id).toBe(user.id)
    const { token } = (await (await request('/api/auth/token', { cookie })).json()) as { token: string }
    const jwt = await bearer(token)
    expect([jwt.user.id, jwt.tenant]).toEqual([user.id, organization.id])
    const created = await request('/api/auth/account/personal-access-tokens/create', { cookie, body: { name: 'Script' } })
    expect(created.status, await created.clone().text()).toBe(200)
    const personal = await bearer(((await created.json()) as { token: string }).token)
    expect([personal.user.id, personal.tenant]).toEqual([user.id, organization.id])

    // The store's own SQL: the users and organizations pages, and the sessions still live.
    expect((await listUsers(auth)).users.map(({ email }) => email)).toEqual(['ana@example.com'])
    expect((await listOrganizations(auth)).organizations).toMatchObject([{ slug: 'acme', members: [{ email: 'ana@example.com', role: 'owner' }] }])
    expect(await liveSessions(auth)([session.session.id])).toEqual(new Map([[session.session.id, user.id]]))
    const { rows } = await store.pool().query('select c_user_id, c_name from login.t_personal_access_token')
    expect(rows).toEqual([{ c_user_id: user.id, c_name: 'Script' }])
  })

  it("keeps Protobase's own tables, the sign-in policy and the staff sign-ins, under those names", async () => {
    const { store, auth } = await serve()
    const { adapter } = await auth.$context
    const policy = { ...defaultSignInPolicy, twoFactor: 'required' as const }
    await saveSignInPolicy(adapter, policy, 'admin-1')
    expect((await readSignInPolicy(adapter, defaultSignInPolicy)).policy).toEqual(policy)
    const at = new Date('2026-11-18T10:00:00Z')
    await logStaffSignIn(adapter, { userId: 'u1', userEmail: 'person@example.com', staff: 'staff@operator.example', staffSubject: 's1', issuer: 'https://id.operator.example', reason: 'Support', sessionId: 'session-1', startedAt: at, expiresAt: at })
    await endStaffSignIn(adapter, 'session-1')
    expect((await listStaffSignIns(adapter))[0]?.endedAt).toBeDefined()
    const { rows } = await store.pool().query('select c_two_factor from login.t_sign_in_policy union all select c_reason from login.t_staff_sign_in')
    expect(rows).toEqual([{ c_two_factor: 'required' }, { c_two_factor: 'Support' }])
  })
})
