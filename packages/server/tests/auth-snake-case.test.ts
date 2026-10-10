import { readFile } from 'node:fs/promises'
import type { PGlite } from '@electric-sql/pglite'
import { hashPassword } from 'better-auth/crypto'
import { PGliteDialect } from 'kysely-pglite-dialect'
import { describe, expect, it } from 'vitest'
import { authSchemaMigration, checkAuthSchema } from '../src/better-auth/auth-schema'
import { createAuth } from '../src/better-auth/create-auth'
import { snakeCaseMigration } from '../src/better-auth/snake-case-migration'
import { createEmptyPg } from '../../../test-support/pglite-snapshot'

const origin = 'http://localhost:5173'
const secret = 'test-secret-test-secret-test-secret-1234'
const password = 'correct horse battery'
const policy = { password: 'allowed', emailCode: 'forbidden', passkey: 'allowed', twoFactor: 'allowed', staffAccess: 'notify', platformSignIn: 'forbidden' }

const schemaOf060 = await readFile(new URL('./support/auth-0.6.0.sql', import.meta.url), 'utf8')

const authOn = (pg: PGlite, schema: string | undefined) =>
  createAuth({ database: { dialect: new PGliteDialect(pg), type: 'postgres', ...(schema && { schemaName: schema }) }, baseURL: origin, secret, mailer: false, operator: false, signInProvider: false })

// Every column with its type, nullability and default, every constraint and every index of the store's schema.
const catalog = async (pg: PGlite, schema: string) =>
  (
    await pg.query<{ line: string }>(
      `select concat_ws(' ', table_name, column_name, data_type, is_nullable, column_default) as line from information_schema.columns where table_schema = $1
       union all select concat_ws(' ', conrelid::regclass, conname, pg_get_constraintdef(oid)) from pg_constraint where connamespace = $1::regnamespace
       union all select indexdef from pg_indexes where schemaname = $1
       order by 1`,
      [schema],
    )
  ).rows.map(({ line }) => line)

// The examples keep the store in an `auth` schema; without `schemaName` it is in the connection's current one.
describe.each([
  { name: 'in an auth schema', schema: 'auth', tables: 'auth' },
  { name: 'in the current schema', schema: undefined, tables: 'public' },
])('the rename of a Protobase 0.6 auth store $name', ({ schema, tables }) => {
  const store060 = async () => {
    const pg = await createEmptyPg()
    await pg.exec(schema ? schemaOf060 : schemaOf060.replaceAll('"auth".', ''))
    return pg
  }

  it('is the migration written for it, after which people sign in as before and admins read the saved policy', async () => {
    const pg = await store060()
    const t = schema ? `"${schema}".` : ''
    await pg.exec(`
      insert into ${t}"user" (id, name, email, "emailVerified", role) values ('u1', 'Root', 'root@example.com', true, 'admin');
      insert into ${t}account (id, "accountId", "providerId", "userId", password, "updatedAt") values ('a1', 'u1', 'credential', 'u1', '${await hashPassword(password)}', now());
      insert into ${t}session (id, token, "expiresAt", "updatedAt", "userId") values ('s1', 'token-from-0.6', now() + interval '1 day', now(), 'u1');
      insert into ${t}"signInPolicy" (id, password, "emailCode", passkey, "twoFactor", "staffAccess", "platformSignIn", "createdAt", "createdBy")
        values ('p1', 'allowed', 'forbidden', 'allowed', 'allowed', 'notify', 'forbidden', now(), 'u1');
    `)
    const auth = authOn(pg, schema)
    await expect(checkAuthSchema(auth)).rejects.toThrow(/still has the camelCase names of Protobase 0\.6.*`protobase auth migration`/)

    const migration = await authSchemaMigration(auth)
    expect(migration).toBe(snakeCaseMigration(schema))
    await pg.transaction((tx) => tx.exec(migration!))
    await expect(checkAuthSchema(auth)).resolves.toBeUndefined()
    expect(await authSchemaMigration(auth)).toBeUndefined()

    // Served by a new start, as after the project's migrations: Better Auth checks the schema once per start.
    const served = authOn(pg, schema)
    const request = (path: string, init: RequestInit = {}) => served.handler(new Request(`${origin}/api/auth${path}`, { ...init, headers: { 'content-type': 'application/json', origin, ...init.headers } }))
    const signIn = await request('/sign-in/email', { method: 'POST', body: JSON.stringify({ email: 'root@example.com', password }) })
    expect(signIn.status).toBe(200)
    const cookie = signIn.headers.getSetCookie().map((line) => line.split(';')[0]).join('; ')
    const answer = await (await request('/policy/sign-in', { headers: { cookie } })).json()
    expect(answer).toMatchObject({ policy, savedBy: 'root@example.com' })
    expect((await pg.query(`select token from ${t}session where user_id = 'u1' order by created_at`)).rows).toEqual([{ token: 'token-from-0.6' }, { token: expect.any(String) }])
  })

  it('leaves the store as one set up with the snake_case names, and such a store as it is', async () => {
    const renamed = await store060()
    await renamed.exec(snakeCaseMigration(schema))
    const fresh = await createEmptyPg()
    await fresh.exec((await authSchemaMigration(authOn(fresh, schema)))!)
    const before = await catalog(fresh, tables)
    await fresh.exec(snakeCaseMigration(schema))

    expect(await catalog(fresh, tables)).toEqual(before)
    expect(await catalog(renamed, tables)).toEqual(before)
  })
})
