import { Kysely } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { f, l, resource, view, type AccessContext } from '@protobase/schema'
import { createAdmin } from '../src/create-admin'
import { as, testAuthenticator } from '../../../test-support/server'
import { openSnapshotDb } from '../../../test-support/sql-snapshot'

const isLoop = (ctx: AccessContext) => ctx.user?.roles?.includes('loop') ?? false
const isAdmin = (ctx: AccessContext) => ctx.user?.roles?.includes('admin') ?? false

// The admin sets a sealed value that only the loop reads.
const secrets = resource('secrets')
  .table('secrets')
  .fields({
    id: f.integer().readOnly(),
    name: f.text(),
    sealed_value: f.text().sensitive().access({ read: isLoop, create: isAdmin, update: isAdmin }),
  })
  .primaryKey((r) => r.id)

const secretsView = view<typeof secrets>('secrets')
  .list((r) => ({ columns: [r.name] }))
  .fields((r) => ({ sealed_value: r.sealed_value.label('Sealed value') }))
  .layout((r) => [l.section('Secret', [r.name, r.sealed_value])])

// Any sealed-looking text in a response is a leak
const leaked = (text: string) => text.includes('v1.')

let db: Kysely<any>
let app: ReturnType<typeof createAdmin>
beforeAll(async () => {
  const pg = await openSnapshotDb('empty')
  await pg.exec(`
    create table secrets (id integer generated always as identity primary key, name text not null, sealed_value text not null);
    insert into secrets (name, sealed_value) values ('TOKEN', 'v1.first');
  `)
  db = new Kysely({ dialect: pg.dialect })
  // Reveals are audited to nowhere, so the run prints none
  app = createAdmin({ resources: [secrets], views: [secretsView], db, authenticate: testAuthenticator, options: { audit: { publish: async () => {} } } })
})
afterAll(async () => { await db.destroy() })

const call = (path: string, init: RequestInit = {}, roles = 'admin') =>
  app.request(path.startsWith('/api/') ? path : `/api/v1${path}`, { ...init, headers: { ...as(1, roles), 'content-type': 'application/json', ...(init.headers as Record<string, string>) } })
const post = (path: string, body: unknown, roles = 'admin') => call(path, { method: 'POST', body: JSON.stringify(body) }, roles)
const patch = (path: string, body: unknown, roles = 'admin') => call(path, { method: 'PATCH', headers: { 'if-match': '*' }, body: JSON.stringify(body) }, roles)
const reveal = (key: number, roles: string) => post(`/secrets/${key}:reveal`, { field: 'sealed_value' }, roles)

describe('a write-only field', () => {
  it('is set by the role that may only write it, and no response of theirs carries it', async () => {
    const created = await post('/secrets', { name: 'KEY', sealed_value: 'v1.created' })
    expect(created.status).toBe(201)
    const body = await created.text()
    expect(leaked(body)).toBe(false)
    const id = JSON.parse(body).id as number

    const updated = await patch(`/secrets/${id}`, { sealed_value: 'v1.updated' })
    expect(updated.status).toBe(200)
    expect(leaked(await updated.text())).toBe(false)

    const batch = await post('/api/v1:batchWrite', { ops: [{ op: 'update', resource: 'secrets', key: id, etag: '*', data: { sealed_value: 'v1.batched' } }] })
    expect(batch.status).toBe(200)
    expect(leaked(await batch.text())).toBe(false)

    for (const path of ['/secrets', `/secrets/${id}`]) expect(leaked(await (await call(path)).text()), path).toBe(false)
    expect((await call(`/secrets/${id}?fields=sealed_value`)).status).toBe(400)
    expect((await reveal(id, 'admin')).status).toBe(400)
    expect(await (await reveal(id, 'loop')).json()).toEqual({ field: 'sealed_value', value: 'v1.batched' })
  })

  it('is edited on the record page of the role that may only write it, with nothing to show', async () => {
    const record = await (await call('/secrets/1')).json()
    expect(record.permissions.fields).toEqual({ id: 'read', name: 'edit', sealed_value: 'edit' })
    expect((await (await call('/secrets/1', {}, 'loop')).json()).permissions.fields.sealed_value).toBe('read')

    const meta = await (await call('/api/meta')).json()
    expect(meta.resources[0].fields.sealed_value).toMatchObject({ readOnly: false, sensitive: true, writeOnly: true, filterable: false, sortable: false })
    expect(meta.views[0].layout[0].fields).toEqual(['name', 'sealed_value'])
    expect(meta.views[0].fields).toEqual({ sealed_value: { label: 'Sealed value' } })
    const reader = await (await call('/api/meta', {}, 'loop')).json()
    expect(reader.resources[0].fields.sealed_value).not.toHaveProperty('writeOnly')
  })
})
