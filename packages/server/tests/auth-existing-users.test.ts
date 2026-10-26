import { sql } from 'kysely'
import { describe, expect, it } from 'vitest'
import { authSchemaMigration, checkAuthSchema } from '../src/better-auth/auth-schema'
import { createAuth } from '../src/better-auth/create-auth'
import { createUser } from '../src/better-auth/users'
import { openSnapshotDb, settled, type SnapshotDb } from '../../../test-support/sql-snapshot'

const origin = 'http://localhost:5173'
const secret = 'test-secret-test-secret-test-secret-1234'
const aliceId = '6f1c2a52-3c1e-4c39-9d0e-2f0b8f6c1a11'
// What Supabase Auth (GoTrue) stores for the password `short-pw1`, shorter than Protobase lets new passwords be.
const aliceHash = '$2a$10$53.u43/FyEHc8FW9OatxRuMKN/jTeIXc87zG6LOnKaq5XJfrnYMa.'

// Supabase's `auth.users`, in part, with the columns an importer adds for Better Auth, and an app's trigger on it.
const goTrueUsers = `
  create schema auth;
  create table auth.users (
    id uuid primary key,
    aud varchar(255),
    role varchar(255),
    email varchar(255),
    encrypted_password varchar(255),
    email_confirmed_at timestamptz,
    raw_user_meta_data jsonb,
    created_at timestamptz,
    updated_at timestamptz,
    name text,
    email_verified boolean,
    image text,
    app_role text,
    banned boolean,
    ban_reason text,
    ban_expires timestamptz
  );
  create table public.profiles (id uuid primary key references auth.users (id), full_name text);
  create function auth.add_profile() returns trigger language plpgsql as $$
  begin
    insert into public.profiles (id, full_name) values (new.id, new.raw_user_meta_data->>'full_name');
    return new;
  end $$;
  create trigger on_user_created after insert on auth.users for each row execute function auth.add_profile();
  insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, name, email_verified, app_role)
    values ('${aliceId}', 'authenticated', 'authenticated', 'alice@example.com', '${aliceHash}', '2026-07-01', '2026-07-01', '2026-07-01', 'Alice', true, 'admin');
`

// Its schema check starts once its context is made; let it finish before the test's next queries.
const authOn = async (pg: SnapshotDb) => {
  const auth = createAuth({
    database: { dialect: pg.dialect, type: 'postgres', schemaName: 'auth' },
    baseURL: origin,
    secret,
    mailer: false,
    operator: false,
    signInProvider: false,
    users: { table: 'users', columns: { role: 'app_role' }, metadata: 'raw_user_meta_data' },
    passwordHashes: ['bcrypt'],
    generateUserId: 'uuid',
  })
  await auth.$context
  await settled()
  return auth
}

describe('Better Auth on an existing users table', () => {
  it('plans its other tables next to it, signs in a bcrypt password and stores it again as scrypt, and adds users there', async () => {
    const pg = await openSnapshotDb('empty')
    await pg.exec(goTrueUsers)
    const auth = await authOn(pg)

    const migration = await authSchemaMigration(auth)
    expect(migration).toContain('create table "auth"."session"')
    expect(migration).toContain('references "auth"."users" (id)')
    // The table and the columns it has already are left as they are; the ones it lacks are added.
    expect(migration).toContain('create table if not exists "auth"."users"')
    expect(migration).toContain('add column if not exists "app_role" text')
    await pg.db.transaction().execute((tx) => sql.raw(migration!).execute(tx))
    await expect(checkAuthSchema(auth)).resolves.toBeUndefined()
    const columns = await pg.query(`select column_name, data_type from information_schema.columns where table_schema = 'auth' and table_name = 'users' and column_name in ('email', 'two_factor_enabled', 'last_role') order by 1`)
    expect(columns.rows).toEqual([
      { column_name: 'email', data_type: 'character varying' },
      { column_name: 'last_role', data_type: 'text' },
      { column_name: 'two_factor_enabled', data_type: 'boolean' },
    ])
    await pg.exec(`insert into auth.account (account_id, provider_id, user_id, password, updated_at) select id::text, 'credential', id, encrypted_password, now() from auth.users`)

    const served = await authOn(pg)
    const signIn = (password: string) =>
      served.handler(new Request(`${origin}/api/auth/sign-in/email`, { method: 'POST', body: JSON.stringify({ email: 'alice@example.com', password }), headers: { 'content-type': 'application/json', origin } }))
    expect((await signIn('wrong-pw1')).status).toBe(401)
    const first = await signIn('short-pw1')
    expect(first.status).toBe(200)
    expect((await first.json()).user).toMatchObject({ email: 'alice@example.com', role: 'admin' })
    const [stored] = (await pg.query<{ password: string }>(`select password from auth.account where user_id = '${aliceId}'`)).rows
    expect(stored!.password).not.toMatch(/^\$2/)
    expect((await signIn('short-pw1')).status).toBe(200)

    const carol = await createUser(served, { email: 'carol@example.com', password: 'carol-password-1', name: 'Carol C', role: 'user', metadata: { full_name: 'Carol C' } })
    expect(carol.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    const row = await pg.query(`select u.app_role, u.role, u.raw_user_meta_data, p.full_name from auth.users u join public.profiles p using (id) where u.email = 'carol@example.com'`)
    expect(row.rows).toEqual([{ app_role: 'user', role: null, raw_user_meta_data: { full_name: 'Carol C' }, full_name: 'Carol C' }])
  })
})
