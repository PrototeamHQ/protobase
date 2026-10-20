import { readFileSync } from 'node:fs'
import { afterEach, expect, it, vi } from 'vitest'
import { authSchemaMigration, createAuth, createUser } from '@protobase/server'
import { openSnapshotDb, settled, type SnapshotDb } from '../../../../test-support/sql-snapshot'
import { supabaseUsers } from '../../src/supabase/auth-config'
import { splitDump } from '../../src/supabase/statements'
import { accountsMigration, usersColumnsMigration } from '../../src/supabase/users-migrations'

// Real scrypt hashing runs on this thread, CPU work a busy machine stretches past 5 s.
vi.setConfig({ testTimeout: 30_000 })

// Supabase Auth's users and identities tables and the app's sign-up trigger on them, as the dump of schema-restore.test.ts
// has them (which restores all of it), with users Supabase Auth itself made (fixtures/gotrue-users.sql): the import's
// migrations around Better Auth's own, and Better Auth signing them in.
const tables = String.raw`(auth\.(users|identities)|public\.profiles)`
const kept = new RegExp(`^(CREATE SCHEMA auth;|CREATE TABLE ${tables} |ALTER TABLE ONLY ${tables}\n|CREATE (UNIQUE )?INDEX \\S+ ON ${tables} |CREATE FUNCTION public\\.handle_new_user\\(|CREATE TRIGGER on_auth_user_created )`)
const goTrueTables = splitDump(readFileSync(new URL('fixtures/supabase-schema.sql', import.meta.url), 'utf8'))
  .filter((piece) => piece.kind === 'statement' && kept.test(piece.text))
  .map((piece) => piece.text)
  .join('\n')
const gotrueUsers = readFileSync(new URL('fixtures/gotrue-users.sql', import.meta.url), 'utf8')

const origin = 'http://localhost:5173'
const secret = 'test-secret-test-secret-test-secret-1234'

// GitHub as Better Auth's provider calls it, for the user GoTrue's github provider signed in (fixtures/gotrue-users.sql).
const mockGitHub = () => {
  const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } })
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(new Request(input, init).url)
    if (url.href === 'https://github.com/login/oauth/access_token') return json({ access_token: 'gho_grace', token_type: 'bearer', scope: 'read:user,user:email' })
    if (url.href === 'https://api.github.com/user') return json({ id: 4207001, login: 'gracehopper', name: 'Grace Hopper', email: 'grace@example.com', avatar_url: 'https://avatars.example.com/u/4207001' })
    if (url.href === 'https://api.github.com/user/emails') return json([{ email: 'grace@example.com', primary: true, verified: true }])
    throw new Error(`Unexpected request to ${url.href}`)
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

// Its schema check starts once its context is made; let it finish before the test's next queries.
const authOn = async (pg: SnapshotDb) => {
  const auth = createAuth({
    database: { dialect: pg.dialect, type: 'postgres', schemaName: 'auth' },
    baseURL: origin,
    secret,
    mailer: false,
    operator: false,
    signInProvider: false,
    socialProviders: { github: { clientId: 'Iv1.client', clientSecret: 'client-secret' } },
    ...supabaseUsers,
  })
  await auth.$context
  await settled()
  return auth
}

// Better Auth's rate limits are per client address, so every request comes from an address of its own.
let client = 0
const from = () => ({ 'x-forwarded-for': `192.0.2.${++client}` })
const cookies = (response: Response) => response.headers.getSetCookie().map((line) => line.split(';')[0]).join('; ')

it("signs Supabase's users in with their own passwords and GitHub, and adds new users to auth.users", async () => {
  const pg = await openSnapshotDb('empty')
  await pg.exec(goTrueTables)
  await pg.exec(usersColumnsMigration())
  // The import's load, with the app's triggers off, so the sign-up trigger does not run for users already there.
  await pg.exec(`alter table auth.users disable trigger user;\n${gotrueUsers}\nalter table auth.users enable trigger user;`)

  const migration = await authSchemaMigration(await authOn(pg))
  expect(migration).toContain('create table if not exists "auth"."account"')
  expect(migration).not.toContain('create table if not exists "auth"."users"')
  await pg.exec(migration!)
  await pg.exec(accountsMigration())

  const [users] = await pg.exec('select email, name, email_verified, image, banned, ban_expires = banned_until as ban_kept, app_role from auth.users order by email')
  expect(users!.rows).toEqual([
    { email: 'alice@example.com', name: 'Alice Archer', email_verified: true, image: null, banned: null, ban_kept: null, app_role: null },
    { email: 'bob@example.com', name: 'Bob', email_verified: true, image: 'https://example.com/bob.png', banned: null, ban_kept: null, app_role: null },
    { email: 'dave@example.com', name: null, email_verified: false, image: null, banned: null, ban_kept: null, app_role: null },
    { email: 'erin@example.com', name: null, email_verified: true, image: null, banned: true, ban_kept: true, app_role: null },
    { email: 'grace@example.com', name: 'Grace Hopper', email_verified: true, image: 'https://avatars.example.com/u/4207001', banned: null, ban_kept: null, app_role: null },
  ])
  const [accounts] = await pg.exec("select u.email, a.provider_id, a.account_id = u.id::text as own_id, a.account_id, left(a.password, 4) as hash from auth.account a join auth.users u on u.id = a.user_id order by 1, 2")
  expect(accounts!.rows).toEqual([
    { email: 'alice@example.com', provider_id: 'credential', own_id: true, account_id: expect.any(String), hash: '$2a$' },
    { email: 'bob@example.com', provider_id: 'credential', own_id: true, account_id: expect.any(String), hash: '$2a$' },
    { email: 'erin@example.com', provider_id: 'credential', own_id: true, account_id: expect.any(String), hash: '$2a$' },
    { email: 'grace@example.com', provider_id: 'github', own_id: false, account_id: '4207001', hash: null },
  ])

  const served = await authOn(pg)
  const signIn = (email: string, password: string) =>
    served.handler(new Request(`${origin}/api/auth/sign-in/email`, { method: 'POST', body: JSON.stringify({ email, password }), headers: { 'content-type': 'application/json', origin, ...from() } }))
  expect((await signIn('alice@example.com', 'wrong-pw1')).status).toBe(401)
  // GoTrue's minimum is 6 characters, Protobase's 12 for new passwords only.
  expect((await signIn('alice@example.com', 'short-pw1')).status).toBe(200)
  expect((await signIn('bob@example.com', 'bob-longer-password')).status).toBe(200)
  expect((await signIn('erin@example.com', 'erin-password-1')).status).toBe(403)
  // Dave never confirmed his address, so GoTrue refused his password and so does Protobase: he has no password account.
  expect((await signIn('dave@example.com', 'dave-password-1')).status).toBe(401)

  // Grace signed up with GitHub on Supabase: signing in with it finds her user by the account the import made.
  mockGitHub()
  const start = await served.handler(
    new Request(`${origin}/api/auth/sign-in/social`, { method: 'POST', headers: { 'content-type': 'application/json', origin, ...from() }, body: JSON.stringify({ provider: 'github', callbackURL: `${origin}/`, disableRedirect: true }) }),
  )
  const state = new URL(((await start.json()) as { url: string }).url).searchParams.get('state') ?? ''
  const callback = await served.handler(new Request(`${origin}/api/auth/callback/github?code=the-code&state=${encodeURIComponent(state)}`, { headers: { cookie: cookies(start), ...from() } }))
  expect(callback.status).toBe(302)
  expect(callback.headers.get('location')).toBe(`${origin}/`)
  const session = await served.api.getSession({ headers: new Headers({ cookie: cookies(callback) }) })
  const [grace] = await pg.exec("select u.id, count(a.id)::int as github_accounts from auth.users u join auth.account a on a.user_id = u.id and a.provider_id = 'github' where u.email = 'grace@example.com' group by u.id")
  expect(grace!.rows).toEqual([{ id: session?.user.id, github_accounts: 1 }])

  // A new user gets a UUID and GoTrue's role and audience, and the app's sign-up trigger makes her profile.
  const carol = await createUser(served, { email: 'carol@example.com', password: 'carol-password-1', name: 'Carol C', role: 'user', metadata: { full_name: 'Carol C' } })
  expect(carol.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  const [row] = await pg.exec("select u.role, u.aud, u.app_role, p.full_name from auth.users u join public.profiles p using (id) where u.email = 'carol@example.com'")
  expect(row!.rows).toEqual([{ role: 'authenticated', aud: 'authenticated', app_role: 'user', full_name: 'Carol C' }])
})
