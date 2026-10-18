import { Kysely } from 'kysely'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { Page, page } from '@protobase/layout'
import { f, resource } from '@protobase/schema'
import { createAdmin } from '../src/create-admin'
import type { AdminOptions } from '../src/admin-options'
import { as, testAuthenticator } from '../../../test-support/server'
import { openSnapshotDb, type SnapshotDb } from '../../../test-support/sql-snapshot'

const orders = resource('orders')
  .table('orders')
  .fields({ id: f.integer().readOnly(), title: f.text() })
  .primaryKey((r) => r.id)

const desk = { url: 'https://desk.example.com/api/v1', label: 'Service desk', resources: ['tickets'] }
const cloud = { url: 'https://cloud.example.com/api/v1', label: 'Cloud', resources: ['tasks'], roles: ['admin'] }

let db: Kysely<any>
beforeAll(async () => {
  const pg = await openSnapshotDb('empty')
  await pg.exec('create table orders (id integer generated always as identity primary key, title text not null)')
  db = new Kysely({ dialect: pg.dialect })
})
afterAll(async () => { await db.destroy() })
afterEach(() => { delete process.env.PROTOBASE_SOURCES })

const admin = (sources: AdminOptions['sources']) => createAdmin({ resources: [orders], db, authenticate: testAuthenticator, options: { sources } })

const metaFor = async (app: ReturnType<typeof admin>, roles: string) => (await app.request('/api/meta', { headers: as(1, roles) })).json()

describe('the sources in /meta', () => {
  it("names the options' sources and then PROTOBASE_SOURCES', each to the roles it is for", async () => {
    process.env.PROTOBASE_SOURCES = JSON.stringify([cloud])
    const app = admin([desk])
    expect((await metaFor(app, 'sales')).sources).toEqual([desk])
    expect((await metaFor(app, 'admin')).sources).toEqual([desk, { url: cloud.url, label: cloud.label, resources: cloud.resources }])
  })

  it('names none without sources, or when the option is false', async () => {
    expect(await metaFor(admin(undefined), 'admin')).not.toHaveProperty('sources')
    process.env.PROTOBASE_SOURCES = JSON.stringify([desk])
    expect(await metaFor(admin(false), 'admin')).not.toHaveProperty('sources')
  })
})

describe('a source at startup', () => {
  it("stops the server when it draws a resource under a name of the app's own resources or pages", () => {
    expect(() => admin([{ ...desk, resources: ['orders'] }])).toThrow('The source Service desk (https://desk.example.com/api/v1) draws the resource "orders", which is also a resource of the app\'s own')
    const overview = page('tickets', Page({ title: 'Tickets' }))
    process.env.PROTOBASE_SOURCES = JSON.stringify([desk])
    expect(() => createAdmin({ resources: [orders], pages: [overview], db, authenticate: testAuthenticator })).toThrow('which is also a page of the app\'s own')
  })

  it('stops the server on a variable that cannot be read', () => {
    process.env.PROTOBASE_SOURCES = 'desk'
    expect(() => admin(undefined)).toThrow('PROTOBASE_SOURCES is not JSON')
  })
})
