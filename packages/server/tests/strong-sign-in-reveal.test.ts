import { Kysely } from 'kysely'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { f, resource } from '@protobase/schema'
import type { AuditEvent, AuditQueue, Authenticator } from '../src/types'
import { createAdmin } from '../src/create-admin'
import { as, testAuthenticator } from '../../../test-support/server'
import { openSnapshotDb } from '../../../test-support/sql-snapshot'

const apps = resource('apps')
  .table('apps')
  .fields({
    id: f.integer().readOnly().filterable().sortable(),
    organizationId: f.relation('organizations').filterable(),
    name: f.text(),
    recoveryCode: f.text().strongSignIn({ minutes: 10 }),
    deployKey: f.text().sensitive(),
  })
  .primaryKey((r) => r.id)
  .tenant((r) => r.organizationId)

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
    create table apps (id integer generated always as identity primary key, organization_id integer not null, name text not null, recovery_code text not null, deploy_key text not null);
    insert into apps (organization_id, name, recovery_code, deploy_key) values (1, 'Shop', 'recover-shop', 'deploy-shop'), (2, 'Blog', 'recover-blog', 'deploy-blog');
  `)
  db = new Kysely({ dialect: pg.dialect })
  app = createAdmin({ resources: [apps], db, authenticate, options: { audit: queue } })
})
afterAll(async () => { await db.destroy() })
beforeEach(() => { events.length = 0 })

const reveal = (key: number, field: string, headers: Record<string, string> = {}, roles = 'owner') =>
  app.request(`/api/v1/apps/${key}:reveal`, { method: 'POST', headers: { ...as(1, roles), 'content-type': 'application/json', ...headers }, body: JSON.stringify({ field }) })

describe('a field that needs a recent strong sign-in', () => {
  it('is in the model with its minutes, and sensitive', async () => {
    const meta = await (await app.request('/api/meta', { headers: as(1, 'owner') })).json()
    expect(meta.resources.find((model: { name: string }) => model.name === 'apps').fields.recoveryCode).toMatchObject({ sensitive: true, strongSignIn: { minutes: 10 } })
  })

  it('is revealed after a strong sign-in in the last minutes, with its audit event', async () => {
    const response = await reveal(1, 'recoveryCode', { 'x-strong-at': minutesAgo(9) })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ field: 'recoveryCode', value: 'recover-shop' })
    expect(events).toEqual([expect.objectContaining({ type: 'field.revealed', resource: 'apps', recordKey: '1', field: 'recoveryCode' })])
  })

  it('is refused, with nothing published, when the strong sign-in is too old or never was', async () => {
    for (const headers of [{ 'x-strong-at': minutesAgo(11) }, {}] as Record<string, string>[]) {
      const response = await reveal(1, 'recoveryCode', headers)
      expect(response.status).toBe(403)
      const problem = await response.json()
      expect(problem).toMatchObject({ type: 'urn:protobase:problem:strong-sign-in-required', minutes: 10 })
      expect(JSON.stringify(problem)).not.toContain('recover-shop')
    }
    expect(events).toEqual([])
  })

  it('is refused to staff signed in as the person, whatever their sign-in', async () => {
    expect((await reveal(1, 'recoveryCode', { 'x-strong-at': minutesAgo(1), 'x-staff': 'true' })).status).toBe(403)
  })

  it('answers a record the caller cannot read as missing before asking for a strong sign-in', async () => {
    expect((await reveal(2, 'recoveryCode')).status).toBe(404)
  })

  it('leaves the other sensitive fields as they were', async () => {
    expect(await (await reveal(1, 'deployKey')).json()).toEqual({ field: 'deployKey', value: 'deploy-shop' })
  })

  it('is documented with the refusal', async () => {
    const spec = await (await app.request('/api/openapi.json', { headers: as(1, 'owner') })).json()
    const path = spec.paths['/apps/{key}:reveal'].post
    expect(path.requestBody.content['application/json'].schema.properties.field.enum).toEqual(['recoveryCode', 'deployKey'])
    expect(path.responses).toHaveProperty('403')
  })
})
