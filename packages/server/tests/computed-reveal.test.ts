import { Kysely } from 'kysely'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { f, resource } from '@protobase/schema'
import type { AuditEvent, AuditQueue, Authenticator } from '../src/types'
import { createAdmin } from '../src/create-admin'
import { as, testAuthenticator } from '../../../test-support/server'
import { openSnapshotDb } from '../../../test-support/sql-snapshot'

const owner = (ctx: { user?: { roles?: readonly string[] } }) => ctx.user?.roles?.includes('owner') ?? false

// Values another service keeps, as the computed reveals fetch them.
const secretKeys: Record<number, string> = { 1: 'sb_secret_first', 2: 'sb_secret_second' }

const apps = resource('apps')
  .table('apps')
  .fields({
    id: f.integer().readOnly().filterable().sortable(),
    organizationId: f.relation('organizations').filterable(),
    name: f.text(),
    deployKey: f.text().sensitive(),
  })
  .primaryKey((r) => r.id)
  .tenant((r) => r.organizationId)
  .reveals({
    secretKey: { value: (app) => secretKeys[app.id] ?? null, read: owner, strongSignIn: {} },
    env: { value: (app, caller) => `APP_NAME=${app.name}\nREVEALED_BY=${caller.user.id}` },
  })

// The time each request's sign-in last proved a passkey or a second step, as a header gives it, and whether staff started it.
const authenticate: Authenticator = async (request) => {
  const session = await testAuthenticator(request)
  const strong = request.headers.get('x-strong-at')
  const staff = request.headers.get('x-staff') === 'true'
  return { ...session, signIn: { session: 's1', staff, strongAt: async () => (strong ? new Date(strong) : undefined) } }
}

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString()

let db: Kysely<any>
const events: AuditEvent[] = []
const queue: AuditQueue = { publish: async (event) => void events.push(event) }
let app: ReturnType<typeof createAdmin>
beforeAll(async () => {
  const pg = await openSnapshotDb('empty')
  await pg.exec(`
    create table apps (id integer generated always as identity primary key, organization_id integer not null, name text not null, deploy_key text not null);
    insert into apps (organization_id, name, deploy_key) values (1, 'Shop', 'deploy-shop'), (2, 'Blog', 'deploy-blog');
  `)
  db = new Kysely({ dialect: pg.dialect })
  app = createAdmin({ resources: [apps], db, authenticate, options: { audit: queue } })
})
afterAll(async () => { await db.destroy() })
beforeEach(() => { events.length = 0 })

const reveal = (key: number, field: string, headers: Record<string, string> = {}, roles = 'owner') =>
  app.request(`/api/v1/apps/${key}:reveal`, { method: 'POST', headers: { ...as(1, roles), 'content-type': 'application/json', ...headers }, body: JSON.stringify({ field }) })

describe('a computed reveal', () => {
  it('makes its value from the record and the caller, and publishes its audit event', async () => {
    const response = await reveal(1, 'env', {}, 'member')
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.json()).toEqual({ field: 'env', value: 'APP_NAME=Shop\nREVEALED_BY=tester' })
    expect(events).toEqual([expect.objectContaining({ type: 'field.revealed', resource: 'apps', recordKey: '1', field: 'env', tenant: 1 })])
  })

  it('needs a recent strong sign-in when it says so, 15 minutes by default', async () => {
    expect((await reveal(1, 'secretKey', { 'x-strong-at': minutesAgo(16) })).status).toBe(403)
    expect(await (await reveal(1, 'secretKey', { 'x-strong-at': minutesAgo(14) })).json()).toEqual({ field: 'secretKey', value: 'sb_secret_first' })
  })

  it('is unknown to a caller its read rule leaves out, and to records of another organization', async () => {
    expect((await reveal(1, 'secretKey', { 'x-strong-at': minutesAgo(1) }, 'member')).status).toBe(400)
    expect((await reveal(2, 'env')).status).toBe(404)
    expect(events).toEqual([])
  })

  it('is listed in the API description beside the sensitive fields', async () => {
    const spec = await (await app.request('/api/openapi.json', { headers: as(1, 'owner') })).json()
    expect(spec.paths['/apps/{key}:reveal'].post.requestBody.content['application/json'].schema.properties.field.enum).toEqual(['deployKey', 'secretKey', 'env'])
  })

  it('refuses a name a field has', () => {
    expect(() => resource('apps').table('apps').fields({ id: f.integer(), env: f.text() }).reveals({ env: { value: () => null } })).toThrow('the reveal "env" has the name of a field')
  })
})
