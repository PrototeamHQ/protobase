import { Kysely } from 'kysely'
import { PGliteDialect } from 'kysely-pglite-dialect'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { defineRoles, f, resource } from '@protobase/schema'
import { createAdmin } from '../src/create-admin'
import { as, json, testAuthenticator } from '../../../test-support/server'
import { createEmptyPg } from '../../../test-support/pglite-snapshot'

const places = resource('places')
  .table('places')
  .fields({ id: f.integer().readOnly().sortable(), name: f.text(), region: f.text(), photo: f.json().optional() })
  .primaryKey((r) => r.id)

const agencies = resource('agencies')
  .table('agencies')
  .fields({ id: f.integer().readOnly(), name: f.text(), closedAt: f.timestamp().optional().readOnly() })
  .primaryKey((r) => r.id)
  .softDelete((r) => r.closedAt)

const listings = resource('listings')
  .table('listings')
  .fields({
    id: f.integer().readOnly().sortable(),
    address: f.text(),
    placeId: f.relation('places').optional().filterable(),
    agencyId: f.relation('agencies'),
    price: f.integer().filterable(),
    lat: f.decimal({ precision: 8, scale: 6 }).filterable(),
    lng: f.decimal({ precision: 9, scale: 6 }).filterable(),
  })
  .primaryKey((r) => r.id)

const ddl = `
create table places (id integer generated always as identity primary key, name text not null, region text not null, photo jsonb);
insert into places (name, region) values ('Amsterdam', 'north'), ('Haarlem', 'north'), ('Madrid', 'south');
create table agencies (id integer generated always as identity primary key, name text not null, closed_at timestamptz);
insert into agencies (name, closed_at) values ('Open Homes', null), ('Gone Estates', now());
create table listings (
  id integer generated always as identity primary key, address text not null, place_id integer references places (id),
  agency_id integer not null references agencies (id), price integer not null, lat numeric(8, 6) not null, lng numeric(9, 6) not null
);
insert into listings (address, place_id, agency_id, price, lat, lng) values
  ('Damrak 1', 1, 1, 500, 52.37, 4.89), ('Grote Markt 2', 2, 2, 400, 52.38, 4.63), ('Gran Via 3', 3, 1, 300, 40.42, -3.70),
  ('Damrak 4', 1, 1, 200, 52.37, 4.90), ('Nowhere 5', null, 1, 100, 52.00, 5.00);
create index on places (region);
create index on listings (place_id);
create index on listings (price);
create index on listings (lat);
create index on listings (lng);
`

const roles = defineRoles<'places' | 'agencies' | 'listings'>({
  admin: ['places.*', 'agencies.*', 'listings.*'],
  // As the property portal's visitor: places through a field list, without a filterable key
  visitor: [{ 'places.read': ['name', 'region'] }, 'agencies.read', 'listings.read'],
  nameless: [{ 'places.read': ['region'] }, 'agencies.read', 'listings.read'],
  northern: [{ 'places.read': { filter: 'region = "north"' } }, 'agencies.read', 'listings.read'],
  // Reads the listings, but neither places nor agencies
  lister: ['listings.read'],
})

let db: Kysely<any>
let app: ReturnType<typeof createAdmin>
beforeAll(async () => {
  const pg = await createEmptyPg()
  await pg.exec(ddl)
  db = new Kysely({ dialect: new PGliteDialect(pg) })
  app = createAdmin({ resources: [places, agencies, listings], db, authenticate: testAuthenticator, options: { roles } })
})
afterAll(async () => { await db.destroy() })

const list = async (role: string, params: Record<string, string>) => {
  const response = await app.request(`/api/v1/listings?${new URLSearchParams({ order_by: 'id', ...params })}`, { headers: as(undefined, role) })
  return { status: response.status, body: await response.json() }
}

describe('labels on a list', () => {
  it('names the records the page\'s relations point at, by key, in the same answer', async () => {
    const { status, body } = await list('admin', { labels: 'placeId.name,agencyId.name' })
    expect(status).toBe(200)
    expect(body.items.map((item: { placeId: number | null }) => item.placeId)).toEqual([1, 2, 3, 1, null])
    // A soft-deleted agency is not listed, so it is not named either
    expect(body.labels).toEqual({ placeId: { 1: 'Amsterdam', 2: 'Haarlem', 3: 'Madrid' }, agencyId: { 1: 'Open Homes' } })
  })

  it('names only the records on the page', async () => {
    const { body } = await list('admin', { labels: 'placeId.name', page_size: '2' })
    expect(body.labels).toEqual({ placeId: { 1: 'Amsterdam', 2: 'Haarlem' } })
  })

  it('leaves labels out of an answer that does not ask for them', async () => {
    expect(Object.keys((await list('admin', {})).body)).not.toContain('labels')
  })

  it('names records through a field list of the related resource', async () => {
    const { body } = await list('visitor', { labels: 'placeId.name' })
    expect(body.labels).toEqual({ placeId: { 1: 'Amsterdam', 2: 'Haarlem', 3: 'Madrid' } })
  })

  it('names no record outside the related resource\'s row filter', async () => {
    const { body } = await list('northern', { labels: 'placeId.name' })
    expect(body.labels).toEqual({ placeId: { 1: 'Amsterdam', 2: 'Haarlem' } })
  })

  it('names nothing by a field of the related resource the caller cannot read, as by one that does not exist', async () => {
    expect((await list('nameless', { labels: 'placeId.name' })).body.labels).toEqual({ placeId: {} })
    expect((await list('nameless', { labels: 'placeId.region' })).body.labels).toEqual({ placeId: { 1: 'north', 2: 'north', 3: 'south' } })
    expect((await list('admin', { labels: 'placeId.title' })).body.labels).toEqual({ placeId: {} })
  })

  it('names nothing of a resource the caller cannot list', async () => {
    const { status, body } = await list('lister', { labels: 'placeId.name,agencyId.name' })
    expect(status).toBe(200)
    expect(body.labels).toEqual({ placeId: {}, agencyId: {} })
  })

  it('refuses an entry that is not a returned relation and the field that names it, once', async () => {
    const refused = async (params: Record<string, string>) => {
      const { status, body } = await list('admin', params)
      expect(status).toBe(400)
      expect(body.errors[0].parameter).toBe('labels')
      return body.detail as string
    }
    expect(await refused({ labels: 'placeId' })).toContain('relation.field')
    expect(await refused({ labels: 'placeId.name.region' })).toContain('relation.field')
    expect(await refused({ labels: 'owner.name' })).toContain('Unknown field "owner"')
    expect(await refused({ labels: 'price.name' })).toContain('not a relation')
    expect(await refused({ labels: 'placeId.name', fields: 'id,address' })).toContain('not among the returned fields')
    expect(await refused({ labels: 'placeId.name,placeId.region' })).toContain('named twice')
    expect(await refused({ labels: 'placeId.photo' })).toContain('cannot name a record')
  })

  it('names the relations of a :search page, from an array in the body', async () => {
    const response = await app.request('/api/v1/listings:search', json({ filter: 'price >= 300', labels: ['placeId.name'] }, as(undefined, 'admin')))
    const body = await response.json()
    expect(body.labels).toEqual({ placeId: { 1: 'Amsterdam', 2: 'Haarlem', 3: 'Madrid' } })
  })

  it('names the relations of a :seek page', async () => {
    const response = await app.request(`/api/v1/listings:seek?${new URLSearchParams({ position: '3', order_by: 'id', labels: 'placeId.name' })}`, { headers: as(undefined, 'admin') })
    expect((await response.json()).labels).toEqual({ placeId: { 1: 'Amsterdam' } })
  })

  it('names the relations of a map\'s records', async () => {
    const map = async (zoom: string) => {
      const response = await app.request(`/api/v1/listings:map?${new URLSearchParams({ latitude: 'lat', longitude: 'lng', zoom, labels: 'placeId.name' })}`, { headers: as(undefined, 'northern') })
      return response.json()
    }
    expect((await map('10')).labels).toEqual({ placeId: { 1: 'Amsterdam', 2: 'Haarlem' } })
  })
})

describe('label on facets', () => {
  const facets = async (role: string, params: Record<string, string>) => {
    const response = await app.request(`/api/v1/listings:facets?${new URLSearchParams({ field: 'placeId', ...params })}`, { headers: as(undefined, role) })
    return { status: response.status, body: await response.json() }
  }

  it('names each value of a relation by the record it points at', async () => {
    const { body } = await facets('admin', { label: 'name' })
    expect(body.facets).toEqual([
      { value: 1, count: 2, label: 'Amsterdam' },
      expect.objectContaining({ value: 2, label: 'Haarlem' }),
      expect.objectContaining({ value: 3, label: 'Madrid' }),
      { value: null, count: 1 },
    ])
  })

  it('names no value outside the related resource\'s row filter, or by a field the caller cannot read', async () => {
    expect((await facets('northern', { label: 'name' })).body.facets.map((facet: { label?: string }) => facet.label)).toEqual(['Amsterdam', 'Haarlem', undefined, undefined])
    expect((await facets('nameless', { label: 'name' })).body.facets.every((facet: object) => !('label' in facet))).toBe(true)
  })

  it('refuses a label for a field that is not a relation', async () => {
    const response = await app.request(`/api/v1/listings:facets?${new URLSearchParams({ field: 'price', label: 'name' })}`, { headers: as(undefined, 'admin') })
    expect(response.status).toBe(400)
  })
})
