import { Kysely } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { f, resource } from '@protobase/schema'
import { createAdmin } from '../src/create-admin'
import { as, testAuthenticator } from '../../../test-support/server'
import { openSnapshotDb, type SnapshotDb } from '../../../test-support/sql-snapshot'

const places = resource('places')
  .table('places')
  .fields({
    id: f.integer().readOnly().sortable(),
    name: f.text(),
    kind: f.text().filterable(),
    lat: f.decimal({ precision: 8, scale: 6 }).filterable(),
    lng: f.decimal({ precision: 9, scale: 6 }).filterable(),
    raw_lat: f.decimal({ precision: 8, scale: 6 }),
  })
  .primaryKey((r) => r.id)

// 250 places on a grid across Amsterdam, 40 in Utrecht and 3 in Rotterdam
const ddl = `
create table places (id integer generated always as identity primary key, name text not null, kind text not null, lat numeric(8, 6) not null, lng numeric(9, 6) not null, raw_lat numeric(8, 6) not null default 0);
insert into places (name, kind, lat, lng) select 'Amsterdam ' || i, case when i % 5 = 0 then 'house' else 'flat' end, 52.33 + (i / 16) * 0.005, 4.75 + (i % 16) * 0.006 from generate_series(0, 249) i;
insert into places (name, kind, lat, lng) select 'Utrecht ' || i, 'flat', 52.09 + i * 0.0002, 5.12 from generate_series(0, 39) i;
insert into places (name, kind, lat, lng) select 'Rotterdam ' || i, 'house', 51.92, 4.48 + i * 0.001 from generate_series(0, 2) i;
create index on places (kind);
create index on places (lat);
create index on places (lng);
`

let db: Kysely<any>
let app: ReturnType<typeof createAdmin>
beforeAll(async () => {
  const pg = await openSnapshotDb('empty')
  await pg.exec(ddl)
  db = new Kysely({ dialect: pg.dialect })
  app = createAdmin({ resources: [places], db, authenticate: testAuthenticator })
})
afterAll(async () => { await db.destroy() })

const box = (south: number, west: number, north: number, east: number) => `lat >= ${south} AND lat <= ${north} AND lng >= ${west} AND lng <= ${east}`
const map = async (params: Record<string, string>) => {
  const response = await app.request(`/api/v1/places:map?${new URLSearchParams({ latitude: 'lat', longitude: 'lng', ...params })}`, { headers: as(1) })
  return { status: response.status, body: await response.json() }
}
const netherlands = box(50.7, 3.3, 53.6, 7.3)

describe('GET /{resource}:map', () => {
  it('returns buckets of a grid sized for the zoom when many records are in the bounding box', async () => {
    const { status, body } = await map({ zoom: '7', filter: netherlands })
    expect(status).toBe(200)
    expect(body.items).toEqual([])
    expect(body.total_size).toBe(293)
    expect(body.buckets.reduce((sum: number, bucket: { count: number }) => sum + bucket.count, 0)).toBe(293)
    expect(body.buckets[0]).toEqual({ count: 250, latitude: expect.any(Number), longitude: expect.any(Number), bounds: { south: 52.33, west: 4.75, north: 52.405, east: 4.84 } })
  })

  it('returns the records themselves, as a list does, when few are in the bounding box', async () => {
    const { body } = await map({ zoom: '9', filter: box(51.8, 4, 52.2, 5.5), order_by: 'id', fields: 'name,lat,lng' })
    expect(body.buckets).toEqual([])
    expect(body.total_size).toBe(43)
    expect(body.items).toHaveLength(43)
    expect(body.items[0]).toEqual({ name: 'Utrecht 0', lat: '52.090000', lng: '5.120000', etag: expect.any(String), permissions: expect.any(Object) })
  })

  it('combines the bounding box with the list filter', async () => {
    const { body } = await map({ zoom: '7', filter: `(kind = "house") AND ${netherlands}` })
    expect(body.total_size).toBe(53)
    expect(body.items.every((item: { kind: string }) => item.kind === 'house')).toBe(true)
  })

  it('returns at most 200 records from zoom 16 on, and how many there are', async () => {
    const { body } = await map({ zoom: '16', filter: netherlands })
    expect(body.buckets).toEqual([])
    expect(body.items).toHaveLength(200)
    expect(body.total_size).toBe(293)
  })

  it('refuses a position that is no filterable number field, and a zoom MapLibre has not', async () => {
    expect((await map({ zoom: '7', latitude: 'name' })).status).toBe(400)
    expect((await map({ zoom: '7', latitude: 'raw_lat' })).status).toBe(400)
    expect((await map({ zoom: '7', longitude: 'height' })).status).toBe(400)
    expect((await map({ zoom: '23' })).status).toBe(400)
    expect((await map({})).status).toBe(400)
    expect((await map({ zoom: '7', filter: 'lat >=' })).status).toBe(400)
  })
})
