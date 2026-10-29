import { randomUUID } from 'node:crypto'
import { Kysely, PostgresDialect } from 'kysely'
import pg from 'pg'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { f, resource } from '@protobase/schema'
import { authSchemaDrift, authStoreTables, checkQueryRunner, checkResourcesOutsideAuthStore, createUser, deleteUser, queryRunnerMigration, setUserBanned, type AdminAuth } from '@protobase/server'
import { betterAuthAuthenticator } from '@protobase/server/internal'
import { authCatalogue } from './auth-catalogue'
import { createSharedProject } from './shared-project'
import { supabaseBan, supabaseCodeSignIn, supabasePasswordSignIn, supabaseSignUp, supabaseUpdateOwnUser } from './supabase-auth'

// A project `npm create protobase` made on a Supabase database, migrated as `postgres` with its own db/migrate.ts, and
// Supabase Auth beside it on the same users: Supabase's Postgres image with its own init and Supabase Auth's own
// migrations (tests/supabase-auth/stack.sh). The test changes the database for good, so it needs a fresh stack.

const stackUrl = process.env.TEST_SUPABASE_STACK_URL
const asRole = (role: string) => {
  const url = new URL(stackUrl!)
  url.username = role
  return url.toString()
}

const origin = 'http://localhost:5173'
// Better Auth's rate limits are per client address, so every request comes from an address of its own.
let client = 0
const from = () => ({ 'x-forwarded-for': `192.0.2.${(++client % 250) + 1}`, origin })
const cookies = (response: Response) => response.headers.getSetCookie().map((line) => line.split(';')[0]).join('; ')
const secretColumns = ['encrypted_password', 'confirmation_token', 'recovery_token', 'email_change_token_current', 'email_change_token_new', 'reauthentication_token', 'phone_change_token']
const tokenColumns = ['confirmation_token', 'recovery_token', 'email_change_token_current', 'email_change_token_new', 'email_change', 'phone_change_token', 'reauthentication_token']

describe.skipIf(!stackUrl)('a project on a Supabase database it shares with Supabase Auth', () => {
  let admin: postgres.Sql
  let app: postgres.Sql
  let project: Awaited<ReturnType<typeof createSharedProject>>
  let auth: AdminAuth
  let ada: { id: string }
  let catalogueBefore: string[]

  const signIn = (email: string, password: string) =>
    auth.handler(new Request(`${origin}/api/auth/sign-in/email`, { method: 'POST', body: JSON.stringify({ email, password }), headers: { 'content-type': 'application/json', ...from() } }))
  const signedIn = async (email: string, password: string) => {
    const response = await signIn(email, password)
    expect(response.status).toBe(200)
    return { cookie: cookies(response), body: (await response.json()) as { user: { id: string; name: string | null } } }
  }
  const sessionUser = async (cookie: string) => (await auth.api.getSession({ headers: new Headers({ cookie, ...from() }) }))?.user
  // The app's token, as the admin app gets it, and whether the API still takes it.
  const tokenOf = async (cookie: string) => {
    const response = await auth.handler(new Request(`${origin}/api/auth/token`, { headers: { cookie, ...from() } }))
    return ((await response.json()) as { token: string }).token
  }
  const tokenStands = async (token: string) => {
    const authenticate = betterAuthAuthenticator({ auth, tenant: 1 })
    return Promise.resolve(authenticate(new Request(`${origin}/api/x`, { headers: { authorization: `Bearer ${token}` } }))).then(
      (session) => session.user.roles,
      () => undefined,
    )
  }
  const authUser = async (email: string) => (await admin`select * from auth.users where email = ${email}`)[0]
  const viewColumns = async () => (await app<{ column_name: string }[]>`select column_name from information_schema.columns where table_schema = 'app_auth' and table_name = 'users'`).map((row) => row.column_name)

  beforeAll(async () => {
    admin = postgres(stackUrl!, { max: 2, onnotice: () => {} })
    app = postgres(asRole('postgres'), { max: 2, onnotice: () => {} })
    const [fresh] = await admin`select to_regnamespace('app_auth') is null as fresh`
    if (!fresh!.fresh) throw new Error('The stack is not fresh: start a new one with tests/supabase-auth/stack.sh')

    const signUp = await supabaseSignUp('ada@example.com', 'ada-supabase-password', { full_name: 'Ada Lovelace', theme: 'dark' })
    expect(signUp.status).toBe(200)
    ada = (await authUser('ada@example.com'))! as { id: string }
    // A user to delete softly later, a phone-only user and an anonymous one.
    expect((await supabaseSignUp('hedy@example.com', 'hedy-supabase-password', { full_name: 'Hedy Lamarr' })).status).toBe(200)
    await admin`insert into auth.users (instance_id, id, aud, role, phone, phone_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
      values ('00000000-0000-0000-0000-000000000000', ${randomUUID()}, 'authenticated', 'authenticated', '15550001', now(), '{"provider":"phone"}', '{}', now(), now())`
    await admin`insert into auth.users (instance_id, id, aud, role, is_anonymous, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
      values ('00000000-0000-0000-0000-000000000000', ${randomUUID()}, 'authenticated', 'authenticated', true, '{}', '{}', now(), now())`
    catalogueBefore = await authCatalogue(admin)

    project = await createSharedProject(asRole('postgres'))
    const migrated = await project.migrate()
    if (migrated.status !== 0) throw new Error(`db:migrate failed:\n${migrated.stdout}\n${migrated.stderr}`)
    auth = await project.auth()
  }, 300_000)

  afterAll(async () => {
    await project?.dispose()
    await admin?.end()
    await app?.end()
  })

  it("runs on Supabase's own ownership of auth, which postgres may not change", async () => {
    const [row] = await admin`select pg_get_userbyid(nspowner) as schema_owner, has_schema_privilege('postgres', 'auth', 'CREATE') as postgres_creates,
      (select array_agg(distinct pg_get_userbyid(relowner)) from pg_class where relnamespace = 'auth'::regnamespace and relkind = 'r') as table_owners
      from pg_namespace where nspname = 'auth'`
    expect(row).toEqual({ schema_owner: 'supabase_admin', postgres_creates: false, table_owners: ['supabase_auth_admin'] })
  })

  it('writes the config and migrations under create protobase, and the migrations apply as postgres', async () => {
    expect(await project.config()).toContain("users: { table: 'users', columns: { role: 'app_role' }, metadata: 'raw_user_meta_data', keyTable: { schema: 'auth', table: 'users' } }")
    expect(Object.keys(project.migrations)).toEqual(['001_auth.sql', '002_supabase_users.sql'])
    expect(project.migrations['001_auth.sql']).toMatch(/^-- .*, written by `create protobase`\./)
    expect(project.migrations['002_supabase_users.sql']).toMatch(/^-- .*, written by `create protobase`:/)
    expect(Object.values(project.migrations).join('\n')).not.toContain('protobase import supabase')
  })

  it('finds the store as Better Auth needs it, the view included', async () => {
    expect(await authSchemaDrift(auth)).toEqual([])
  })

  it("signs Supabase's user in with their Supabase password, under auth.users' id", async () => {
    expect((await signIn('ada@example.com', 'not-her-password')).status).toBe(401)
    const { body, cookie } = await signedIn('ada@example.com', 'ada-supabase-password')
    expect(body.user).toMatchObject({ id: ada.id, name: 'Ada Lovelace' })
    expect((await sessionUser(cookie))?.id).toBe(ada.id)
    expect((await supabasePasswordSignIn('ada@example.com', 'ada-supabase-password')).status).toBe(200)
  })

  it("shows a name changed in Supabase's user metadata at once", async () => {
    await admin`update auth.users set raw_user_meta_data = raw_user_meta_data || '{"full_name":"Ada King"}' where id = ${ada.id}`
    const { body } = await signedIn('ada@example.com', 'ada-supabase-password')
    expect(body.user.name).toBe('Ada King')
  })

  it('gives a user the project creates a row in auth.users that Supabase Auth signs in by one-time code', async () => {
    const grace = await createUser(auth, { email: 'grace@example.com', password: 'grace-project-password', name: 'Grace Hopper', role: 'admin' })
    const row = (await authUser('grace@example.com'))!
    expect(row.id).toBe(grace.id)
    expect(Object.fromEntries(tokenColumns.map((column) => [column, row[column]]))).toEqual(Object.fromEntries(tokenColumns.map((column) => [column, ''])))
    expect(row).toMatchObject({ role: 'authenticated', aud: 'authenticated', is_super_admin: null, is_sso_user: false, raw_app_meta_data: { provider: 'email', providers: ['email'] } })
    expect(row.raw_user_meta_data).toEqual({ full_name: 'Grace Hopper' })
    const code = await supabaseCodeSignIn('grace@example.com')
    expect(code.status).toBe(200)
    expect(code.body.user.id).toBe(grace.id)
  })

  describe('security', () => {
    it("never lets the assistant's query role read auth.users, the view or the copied password hashes", async () => {
      const db = new Kysely<any>({ dialect: new PostgresDialect({ pool: new pg.Pool({ connectionString: asRole('postgres'), max: 1 }) }) })
      const tables = authStoreTables(auth)
      expect(tables).toEqual(expect.arrayContaining([{ schema: 'auth', name: 'users' }, { schema: 'app_auth', name: 'users' }, { schema: 'app_auth', name: 'account' }]))
      await app.unsafe((await queryRunnerMigration(db, [], tables))!)
      const [role] = await app`select left(current_database(), 57) || '_query' as name`
      const [reads] = await app`select has_table_privilege(${role!.name}, 'auth.users', 'SELECT') as users, has_table_privilege(${role!.name}, 'app_auth.users', 'SELECT') as view,
        has_table_privilege(${role!.name}, 'app_auth.account', 'SELECT') as accounts, has_schema_privilege(${role!.name}, 'app_auth', 'USAGE') as schema`
      expect(reads).toEqual({ users: false, view: false, accounts: false, schema: false })
      await expect(checkQueryRunner(db, tables)).resolves.toBeUndefined()
      await db.destroy()
    })

    it("grants Supabase's API roles nothing in the app's schema", async () => {
      const [row] = await app`select bool_or(has_schema_privilege(role, 'app_auth', 'USAGE')) as usage from unnest(array['anon', 'authenticated', 'service_role', 'supabase_auth_admin']) as role`
      expect(row!.usage).toBe(false)
    })

    it('refuses a resource over auth.users, the view or the accounts at startup', async () => {
      const db = new Kysely<any>({ dialect: new PostgresDialect({ pool: new pg.Pool({ connectionString: asRole('postgres'), max: 1 }) }) })
      const over = (table: string) => resource(table.replace('.', '_')).table(table).fields({ id: f.uuid() }).primaryKey((r) => r.id).toModel()
      for (const table of ['auth.users', 'app_auth.users', 'app_auth.account']) {
        await expect(checkResourcesOutsideAuthStore(db, [over(table)], auth)).rejects.toThrow(`(${table})`)
      }
      await db.destroy()
    })

    it('reads no password, token or app metadata of auth.users into the view, which runs with the reader\'s rights', async () => {
      const columns = await viewColumns()
      expect(columns.filter((column) => secretColumns.includes(column) || column === 'raw_app_meta_data')).toEqual([])
      expect(JSON.stringify(await app`select * from app_auth.users`)).not.toContain('$2')
      const [view] = await app`select reloptions from pg_class where oid = 'app_auth.users'::regclass`
      expect(view!.reloptions).toEqual(['security_invoker=on'])
    })

    it('refuses a password to a user who signed up through Supabase Auth later, who is a user of the project at once', async () => {
      expect((await supabaseSignUp('linus@example.com', 'linus-supabase-password', { full_name: 'Linus' })).status).toBe(200)
      const [shown] = await app`select name from app_auth.users where email = 'linus@example.com'`
      expect(shown).toEqual({ name: 'Linus' })
      expect((await signIn('linus@example.com', 'linus-supabase-password')).status).toBe(401)
      expect((await signIn('linus@example.com', '')).status).not.toBe(200)
    })

    it('leaves out phone-only and anonymous users, and refuses an empty email', async () => {
      const [counts] = await admin`select count(*)::int as all, count(*) filter (where email is null)::int as without_email from auth.users`
      const [shown] = await app`select count(*)::int as shown from app_auth.users`
      expect(counts!.without_email).toBe(2)
      expect(shown!.shown).toBe(counts!.all - 2)
      expect((await signIn('', 'any-password-at-all')).status).not.toBe(200)
    })

    it('ends the session and token of a user Supabase deletes softly, and refuses their password', async () => {
      const { cookie } = await signedIn('hedy@example.com', 'hedy-supabase-password')
      const token = await tokenOf(cookie)
      expect(await tokenStands(token)).toBeDefined()
      await admin`update auth.users set deleted_at = now() where email = 'hedy@example.com'`
      expect(await sessionUser(cookie)).toBeUndefined()
      expect(await tokenStands(token)).toBeUndefined()
      expect((await signIn('hedy@example.com', 'hedy-supabase-password')).status).toBe(401)
    })

    it('answers a new user with a hidden address without the database constraint', async () => {
      const grace = await signedIn('grace@example.com', 'grace-project-password')
      const response = await auth.handler(
        new Request(`${origin}/api/auth/admin/create-user`, {
          method: 'POST',
          body: JSON.stringify({ email: 'hedy@example.com', password: 'hedy-project-password', name: 'Hedy', role: 'admin' }),
          headers: { 'content-type': 'application/json', cookie: grace.cookie, ...from() },
        }),
      )
      expect(response.status).not.toBe(200)
      expect(await response.text()).not.toMatch(/duplicate key|users_email|constraint|auth\.users/)
    })

    it("keeps a ban set in the project the project's own, and its existing token ends", async () => {
      const { cookie } = await signedIn('ada@example.com', 'ada-supabase-password')
      const token = await tokenOf(cookie)
      await setUserBanned(auth, { email: 'ada@example.com', banned: true })
      expect((await signIn('ada@example.com', 'ada-supabase-password')).status).toBe(403)
      expect(await tokenStands(token)).toBeUndefined()
      expect((await authUser('ada@example.com'))!.banned_until).toBeNull()
      await setUserBanned(auth, { email: 'ada@example.com', banned: false })
      expect((await signIn('ada@example.com', 'ada-supabase-password')).status).toBe(200)
    })

    it("holds a ban set in Supabase, which the project's unban does not lift, and ends the existing token", async () => {
      const { cookie } = await signedIn('ada@example.com', 'ada-supabase-password')
      const token = await tokenOf(cookie)
      expect((await supabaseBan(ada.id, '24h')).status).toBe(200)
      expect(await tokenStands(token)).toBeUndefined()
      expect((await signIn('ada@example.com', 'ada-supabase-password')).status).toBe(403)
      await setUserBanned(auth, { email: 'ada@example.com', banned: false })
      expect((await signIn('ada@example.com', 'ada-supabase-password')).status).toBe(403)
      expect((await supabaseBan(ada.id, 'none')).status).toBe(200)
      expect((await signIn('ada@example.com', 'ada-supabase-password')).status).toBe(200)
    })

    it('gives nothing to a role a user writes into their own Supabase metadata', async () => {
      const supabase = await supabasePasswordSignIn('ada@example.com', 'ada-supabase-password')
      expect((await supabaseUpdateOwnUser(supabase.body.access_token, { role: 'admin', app_role: 'admin' })).status).toBe(200)
      const { cookie } = await signedIn('ada@example.com', 'ada-supabase-password')
      expect(await tokenStands(await tokenOf(cookie))).not.toContain('admin')
      const [extra] = await app`select app_role from app_auth.user_extra where id = ${ada.id}`
      expect(extra?.app_role ?? null).not.toBe('admin')
    })

    it("writes no client value into Supabase's own authorization columns, and takes no existing id or email", async () => {
      await expect(app`insert into app_auth.users (email, email_verified, is_super_admin) values ('mallory@example.com', true, true)`).rejects.toThrow(/column "is_super_admin"/)
      const before = await authUser('ada@example.com')
      await expect(app`insert into app_auth.users (id, email, email_verified) values (${ada.id}, 'other@example.com', true)`).rejects.toMatchObject({ code: '23505' })
      await expect(app`insert into app_auth.users (email, email_verified) values ('ada@example.com', true)`).rejects.toMatchObject({ code: '23505' })
      expect(await authUser('ada@example.com')).toEqual(before)
    })

    it('confirms no address of a user created unverified', async () => {
      await app`insert into app_auth.users (email, email_verified, name) values ('ivy@example.com', false, 'Ivy')`
      expect((await authUser('ivy@example.com'))!.email_confirmed_at).toBeNull()
    })

    it("renames a user by their name's key alone, keeping a key Supabase writes meanwhile", async () => {
      const before = (await authUser('ada@example.com'))!
      const { internalAdapter } = await auth.$context
      await internalAdapter.updateUser(ada.id, { name: 'Ada Byron' })
      const after = (await authUser('ada@example.com'))!
      expect(after.raw_user_meta_data).toEqual({ ...before.raw_user_meta_data, full_name: 'Ada Byron' })
      expect(after.raw_app_meta_data).toEqual(before.raw_app_meta_data)

      // Supabase holds the row with a write of another key; the project's rename waits on it and keeps it.
      const supabase = await admin.reserve()
      await supabase`begin`
      await supabase`update auth.users set raw_user_meta_data = raw_user_meta_data || '{"plan":"pro"}' where id = ${ada.id}`
      const rename = app`update app_auth.users set name = 'Ada Lovelace' where id = ${ada.id}`.execute()
      await new Promise((resolve) => setTimeout(resolve, 500))
      await supabase`commit`
      supabase.release()
      await rename
      expect((await authUser('ada@example.com'))!.raw_user_meta_data).toEqual({ ...before.raw_user_meta_data, full_name: 'Ada Lovelace', plan: 'pro' })
    })

    it('deletes a user the project deletes from auth.users, with their accounts and sessions', async () => {
      await createUser(auth, { email: 'joan@example.com', password: 'joan-project-password', name: 'Joan', role: 'admin' })
      const { cookie } = await signedIn('joan@example.com', 'joan-project-password')
      const token = await tokenOf(cookie)
      const id = (await authUser('joan@example.com'))!.id
      await deleteUser(auth, 'joan@example.com')
      expect(await authUser('joan@example.com')).toBeUndefined()
      const [left] = await app`select (select count(*)::int from app_auth.account where user_id = ${id}) as accounts, (select count(*)::int from app_auth.session where user_id = ${id}) as sessions`
      expect(left).toEqual({ accounts: 0, sessions: 0 })
      expect(await sessionUser(cookie)).toBeUndefined()
      expect(await tokenStands(token)).toBeUndefined()
    })
  })

  // Last, after every write the project and Supabase made.
  it('creates and alters nothing in auth', async () => {
    expect(await authCatalogue(admin)).toEqual(catalogueBefore)
  })
})
