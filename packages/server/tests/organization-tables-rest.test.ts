import { Kysely } from 'kysely'
import { expect, it, vi } from 'vitest'
import { f, resource } from '@protobase/schema'
import { authSchemaMigration } from '../src/better-auth/auth-schema'
import { betterAuthAuthenticator } from '../src/better-auth/authenticator'
import { createAuth, type CreateAuthOptions } from '../src/better-auth/create-auth'
import { createUser } from '../src/better-auth/users'
import { createAdmin } from '../src/create-admin'
import { openSnapshotDb, settled } from '../../../test-support/sql-snapshot'

// Real scrypt hashing runs on this thread, CPU work a busy machine stretches past 5 s.
vi.setConfig({ testTimeout: 30_000 })

const origin = 'http://localhost:5173'
const publishable = 'sb_publishable_org_tables_test'
const secretKey = 'sb_secret_org_tables_test'

// The tables organizations scope, by built-in name, and the column of `projects` that points at each.
const scoped = [
  ['session', 'session_id'],
  ['member', 'member_id'],
  ['invitation', 'invitation_id'],
  ['personal_access_token', 'token_id'],
] as const

// Where the store is and what its tables are called: the default `auth` schema, and names the app configures, in the
// `auth` schema and in the app's own.
const layouts: { name: string; schemaName?: string; tables?: CreateAuthOptions['tables'] }[] = [
  { name: 'built-in names in auth', schemaName: 'auth' },
  { name: 'configured names in auth', schemaName: 'auth', tables: { prefix: 'app_', member: { name: 'memberships' } } },
  { name: 'configured names in public', tables: { prefix: 'app_', member: { name: 'memberships' } } },
]

it.each(layouts)("refuses every read, filter, embed and write of the organization's tables on /api/sb/rest/v1, $name", async ({ schemaName, tables }) => {
  const pg = await openSnapshotDb('empty')
  const auth = createAuth({
    database: { dialect: pg.dialect, type: 'postgres', ...(schemaName && { schemaName }) },
    baseURL: origin,
    secret: 'test-secret-test-secret-test-secret-1234',
    mailer: false,
    operator: false,
    signInProviders: [],
    organizations: { default: { id: 'default', name: 'Default', slug: 'default' } },
    personalAccessTokens: { prefix: 'test_' },
    ...(tables && { tables }),
  })
  await auth.$context
  await settled()
  await pg.exec((await authSchemaMigration(auth))!)

  // The store's own name of each table, as a path names it: bare, and with its schema.
  const stored = scoped.map(([internal, column]) => {
    const table = auth.names.table(internal)
    const id = table.schema ? `"${table.schema}"."${table.name}"` : `"${table.name}"`
    return { name: table.name, paths: table.schema ? [table.name, `${table.schema}.${table.name}`] : [table.name], id, column }
  })
  if (tables) expect(stored.map(({ name }) => name)).toEqual(['app_session', 'memberships', 'app_invitation', 'app_personal_access_token'])

  // A served table that points at each of them, so an embed has a foreign key to go through.
  await pg.exec(`create table projects (id text primary key, ${stored.map(({ id, column }) => `${column} text references ${id} (id)`).join(', ')});
    insert into projects (id) values ('p1')`)
  await createUser(auth, { email: 'root@example.com', password: 'correct horse battery', role: 'admin' })
  const projects = resource('projects').table('projects').fields({ id: f.text() }).primaryKey((r) => r.id)
  const app = createAdmin({
    resources: [projects],
    db: new Kysely<any>({ dialect: pg.dialect }),
    authenticate: betterAuthAuthenticator({ auth }),
    auth,
    files: { storage: false },
    options: { apiKeys: { publishable_key: publishable, secret_key: secretKey } },
  })
  // A signed-in user's access token, as supabase-js gets it.
  const signIn = await app.request('/api/sb/auth/v1/token?grant_type=password', {
    method: 'POST',
    headers: { apikey: publishable, 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'root@example.com', password: 'correct horse battery' }),
  })
  expect(signIn.status).toBe(200)
  const userToken = ((await signIn.json()) as { access_token: string }).access_token
  const callers = {
    publishable: { apikey: publishable, authorization: `Bearer ${publishable}` },
    user: { apikey: publishable, authorization: `Bearer ${userToken}` },
    secret: { apikey: secretKey, authorization: `Bearer ${secretKey}` },
  }
  const json = { 'content-type': 'application/json', prefer: 'return=representation' }

  expect((await app.request('/api/sb/rest/v1/projects', { headers: callers.secret })).status).toBe(200)

  // Each cell is a request and the refusal it must get: no such table (PGRST205), or no relationship to embed (PGRST200).
  const cells = Object.entries(callers).flatMap(([caller, headers]) =>
    stored.flatMap(({ name, paths }) => [
      ...paths.flatMap((path) => [
        { what: `GET ${path}`, init: { headers }, url: path, refusal: [404, 'PGRST205'] },
        { what: `GET ${path} filtered`, init: { headers }, url: `${path}?id=eq.x&select=id`, refusal: [404, 'PGRST205'] },
        { what: `POST ${path}`, init: { method: 'POST', headers: { ...headers, ...json }, body: JSON.stringify({ id: 'x' }) }, url: path, refusal: [404, 'PGRST205'] },
        { what: `PATCH ${path}`, init: { method: 'PATCH', headers: { ...headers, ...json }, body: JSON.stringify({ role: 'owner' }) }, url: `${path}?id=eq.x`, refusal: [404, 'PGRST205'] },
        { what: `DELETE ${path}`, init: { method: 'DELETE', headers: { ...headers, ...json } }, url: `${path}?id=eq.x`, refusal: [404, 'PGRST205'] },
      ]),
      { what: `GET projects embedding ${name}`, init: { headers }, url: `projects?select=*,${name}(*)`, refusal: [400, 'PGRST200'] },
    ]).map((cell) => ({ ...cell, what: `${caller}: ${cell.what}` })),
  )
  const answers = []
  for (const cell of cells) {
    const response = await app.request(`/api/sb/rest/v1/${cell.url}`, cell.init)
    const body = (await response.json()) as { code?: string }
    answers.push({ what: cell.what, answer: [response.status, body.code] })
  }
  expect(answers).toEqual(cells.map(({ what, refusal }) => ({ what, answer: refusal })))
})
