import { Kysely } from 'kysely'
import { expect, it, vi } from 'vitest'
import { f, resource } from '@protobase/schema'
import { betterAuthAuthenticator } from '../src/better-auth/authenticator'
import { createAuth } from '../src/better-auth/create-auth'
import { issueToken } from '../src/better-auth/tokens'
import { createUser } from '../src/better-auth/users'
import { createAdmin } from '../src/create-admin'
import { openSnapshotDb } from '../../../test-support/sql-snapshot'

// Real scrypt hashing runs on this thread, CPU work a busy machine stretches past 5 s.
vi.setConfig({ testTimeout: 30_000 })

const origin = 'http://localhost:5173'
const publishable = 'sb_publishable_hidden_test'
const secretKey = 'sb_secret_hidden_test'

// The routes that read tables serve the app's resources only, so a store in the app's own schema, next to its tables,
// is reached by none of them, whatever the caller.
it("answers no route over the auth store's tables, in the app's own database and schema", async () => {
  const pg = await openSnapshotDb('auth')
  await pg.exec(`create table orders (id text primary key); insert into orders values ('o1')`)
  const auth = createAuth({ database: { dialect: pg.dialect, type: 'postgres' }, baseURL: origin, secret: 'test-secret-test-secret-test-secret-1234', mailer: false, operator: false, signInProvider: false })
  await createUser(auth, { email: 'root@example.com', password: 'correct horse battery', role: 'admin' })
  const orders = resource('orders').table('orders').fields({ id: f.text() }).primaryKey((r) => r.id)
  const app = createAdmin({
    resources: [orders],
    db: new Kysely<any>({ dialect: pg.dialect }),
    authenticate: betterAuthAuthenticator({ auth }),
    auth,
    files: { storage: false },
    options: { apiKeys: { publishable_key: publishable, secret_key: secretKey } },
  })
  const admin = { authorization: `Bearer ${(await issueToken(auth, { email: 'root@example.com' })).token}` }
  const service = { apikey: secretKey, authorization: `Bearer ${secretKey}` }

  expect((await app.request('/api/v1/orders', { headers: admin })).status).toBe(200)
  expect((await app.request('/api/sb/rest/v1/orders', { headers: service })).status).toBe(200)
  for (const table of ['user', 'session', 'account', 'jwks', 'member', 'oauth_client', 'auth_migrations']) {
    expect((await app.request(`/api/v1/${table}`, { headers: admin })).status, `/api/v1/${table}`).toBe(404)
    expect((await app.request(`/api/sb/rest/v1/${table}`, { headers: service })).status, `/api/sb/rest/v1/${table}`).toBe(404)
  }
})
