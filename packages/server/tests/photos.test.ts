import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Kysely } from 'kysely'
import { PGliteDialect } from 'kysely-pglite-dialect'
import sharp from 'sharp'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { defineRoles, f, resource } from '@protobase/schema'
import { createAdmin } from '../src/create-admin'
import { localFiles } from '../src/files/local-files'
import { as, json, testAuthenticator } from '../../../test-support/server'
import { createEmptyPg } from '../../../test-support/pglite-snapshot'

const listings = resource('listings')
  .table('listings')
  .fields({ id: f.integer().readOnly().sortable(), address: f.text(), lat: f.decimal({ precision: 8, scale: 6 }).filterable(), lng: f.decimal({ precision: 9, scale: 6 }).filterable() })
  .primaryKey((r) => r.id)

const listingPhotos = resource('listing_photos')
  .table('listing_photos')
  .fields({
    id: f.integer().readOnly(),
    listing_id: f.relation('listings').filterable(),
    position: f.integer().sortable(),
    photo: f.file().accept(['image/*']).public().placeholder('photo_placeholder'),
    photo_placeholder: f.text().readOnly().optional(),
    caption: f.text().optional(),
    hidden: f.boolean(),
    removed_at: f.timestamp().readOnly().optional(),
  })
  .primaryKey((r) => r.id)
  .softDelete((r) => r.removed_at)

// Listing 1 has twelve photos, stored out of order; listing 2 one hidden and one removed; listing 3 none
const ddl = `
create table listings (id integer primary key, address text not null, lat numeric(8, 6) not null, lng numeric(9, 6) not null);
insert into listings values (1, 'Damrak 1', 52.37, 4.89), (2, 'Grote Markt 2', 52.38, 4.63), (3, 'Gran Via 3', 40.42, -3.70);
create table listing_photos (
  id integer primary key, listing_id integer not null references listings (id), position integer not null, photo text not null,
  photo_placeholder text, caption text, hidden boolean not null default false, removed_at timestamptz, unique (listing_id, position)
);
insert into listing_photos (id, listing_id, position, photo, photo_placeholder)
  select 100 + i, 1, (i * 5) % 12 + 1, 'public:photos/a' || ((i * 5) % 12 + 1) || '.jpg?name=a.jpg', 'hash' || ((i * 5) % 12 + 1) from generate_series(0, 11) i;
insert into listing_photos (id, listing_id, position, photo, hidden, removed_at) values
  (201, 2, 1, 'public:photos/b1.jpg?name=b1.jpg', false, null), (202, 2, 2, 'public:photos/b2.jpg?name=b2.jpg', true, null),
  (203, 2, 3, 'public:photos/b3.jpg?name=b3.jpg', false, now());
`

const roles = defineRoles<'listings' | 'listing_photos'>({
  admin: ['listings.*', 'listing_photos.*'],
  visitor: ['listings.read', { 'listing_photos.read': { filter: 'hidden = false' } }],
  // Reads the photos, but not their placeholders
  plain: ['listings.read', { 'listing_photos.read': ['listing_id', 'position', 'photo'] }],
  // Lists the photos' records, but not the photos themselves
  blind: ['listings.read', { 'listing_photos.read': ['listing_id', 'position', 'caption'] }],
  lister: ['listings.read'],
})

const statements: string[] = []
let pg: Awaited<ReturnType<typeof createEmptyPg>>
let db: Kysely<any>
let app: ReturnType<typeof createAdmin>
let dir: string
const createApp = (scanGuard?: { mode: 'warn' }) => {
  const files = { providers: { public: localFiles({ dir, public: true }) }, secret: 'photos-test-secret', sharp }
  return createAdmin({ resources: [listings, listingPhotos], db, authenticate: testAuthenticator, files, options: { roles, ...(scanGuard && { scanGuard }) } })
}
beforeAll(async () => {
  pg = await createEmptyPg()
  await pg.exec(ddl)
  db = new Kysely({ dialect: new PGliteDialect(pg), log: (event) => { statements.push(event.query.sql) } })
  dir = await mkdtemp(path.join(tmpdir(), 'protobase-photos-'))
  app = createApp()
})
afterAll(async () => {
  await db.destroy()
  await rm(dir, { recursive: true, force: true })
})

const photos = 'listing_photos.listing_id.photo'

const list = async (role: string, params: Record<string, string>) => {
  const response = await app.request(`/api/v1/listings?${new URLSearchParams({ order_by: 'id', ...params })}`, { headers: as(undefined, role) })
  return { status: response.status, body: await response.json() }
}

const names = (files: Array<{ uri: string }> = []) => files.map((file) => file.uri.slice('public:photos/'.length, file.uri.indexOf('.jpg')))

describe('photos on a list', () => {
  it('brings each record\'s first photos in their order, at most ten, in the same answer', async () => {
    const { status, body } = await list('admin', { photos, photos_order_by: 'position' })
    expect(status).toBe(200)
    expect(names(body.photos[1])).toEqual(['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7', 'a8', 'a9', 'a10'])
    expect(body.photos[1][0]).toEqual({ uri: 'public:photos/a1.jpg?name=a.jpg', name: 'a.jpg', type: 'image/jpeg', url: '/api/files/public/photos/a1.jpg', placeholder: 'hash1' })
    // A removed photo is not listed; a record without photos is left out
    expect(names(body.photos[2])).toEqual(['b1', 'b2'])
    expect(Object.keys(body.photos)).toEqual(['1', '2'])
  })

  it('orders them as asked, the key breaking ties', async () => {
    expect(names((await list('admin', { photos, photos_order_by: 'position desc' })).body.photos[1]).slice(0, 3)).toEqual(['a12', 'a11', 'a10'])
    expect(names((await list('admin', { photos })).body.photos[1]).slice(0, 3)).toEqual(['a1', 'a6', 'a11'])
  })

  it('reads every record\'s photos in one query', async () => {
    statements.length = 0
    await list('admin', { photos, photos_order_by: 'position' })
    expect(statements.filter((statement) => statement.startsWith('select') && statement.includes('"listing_photos"'))).toHaveLength(1)
  })

  it('brings the photos of the records on the page only, by the key, whatever fields are returned', async () => {
    const { body } = await list('admin', { photos, photos_order_by: 'position', page_size: '1', fields: 'address' })
    expect(body.items).toEqual([expect.objectContaining({ address: 'Damrak 1' })])
    expect(body.items[0]).not.toHaveProperty('id')
    expect(Object.keys(body.photos)).toEqual(['1'])
  })

  it('has the scan guard check that an index serves the lookup', async () => {
    const warning = async () => {
      const response = await createApp({ mode: 'warn' }).request(`/api/v1/listings?${new URLSearchParams({ order_by: 'id', page_size: '3', photos, photos_order_by: 'position' })}`, { headers: as(undefined, 'admin') })
      expect(response.status).toBe(200)
      return response.headers.get('x-protobase-warning')
    }
    // Enough photos of a listing past the page that a scan of them is worth flagging
    await pg.exec(`
      insert into listings values (4, 'Archive 4', 52.0, 5.0);
      insert into listing_photos (id, listing_id, position, photo) select 1000 + i, 4, i, 'public:photos/old.jpg' from generate_series(1, 30000) i;
      analyze listing_photos;
    `)
    expect(await warning()).toBeNull()
    await pg.exec('alter table listing_photos drop constraint listing_photos_listing_id_position_key')
    expect(await warning()).toContain('create index on "listing_photos" ("listing_id")')
    await pg.exec('alter table listing_photos add unique (listing_id, position); delete from listing_photos where listing_id = 4; delete from listings where id = 4; analyze listing_photos')
  })

  it('leaves photos out of an answer that does not ask for them', async () => {
    expect(Object.keys((await list('admin', {})).body)).not.toContain('photos')
  })

  it('brings only the photos the caller could list themselves', async () => {
    expect(names((await list('visitor', { photos, photos_order_by: 'position' })).body.photos[2])).toEqual(['b1'])
    const plain = (await list('plain', { photos, photos_order_by: 'position' })).body.photos[1]
    expect(plain).toHaveLength(10)
    expect(plain[0]).not.toHaveProperty('placeholder')
  })

  it('brings none of a resource the caller cannot list, or whose image, relation or sorted fields they cannot read', async () => {
    expect((await list('lister', { photos })).body.photos).toEqual({})
    expect((await list('blind', { photos })).body.photos).toEqual({})
    expect((await list('plain', { photos, photos_order_by: 'caption' })).body.photos).toEqual({})
    expect((await list('admin', { photos: 'listing_pictures.listing_id.photo' })).body.photos).toEqual({})
    expect((await list('admin', { photos: 'listing_photos.listing_id.caption' })).body.photos).toEqual({})
  })

  it('refuses an entry that is not a resource, its relation and its file field, and an order without photos', async () => {
    const refused = async (params: Record<string, string>) => {
      const { status, body } = await list('admin', params)
      expect(status).toBe(400)
      return body.errors[0].parameter as string
    }
    expect(await refused({ photos: 'listing_photos.photo' })).toBe('photos')
    expect(await refused({ photos: 'listing_photos.listing_id.photo.position' })).toBe('photos')
    expect(await refused({ photos_order_by: 'position' })).toBe('photos_order_by')
  })

  it('brings the photos of a :search page, from its body', async () => {
    const response = await app.request('/api/v1/listings:search', json({ filter: 'lat > 50', photos, photos_order_by: 'position' }, as(undefined, 'visitor')))
    const body = await response.json()
    expect(Object.keys(body.photos)).toEqual(['1', '2'])
  })

  it('brings the photos of a map\'s records', async () => {
    const map = async (zoom: string) => {
      const response = await app.request(`/api/v1/listings:map?${new URLSearchParams({ latitude: 'lat', longitude: 'lng', zoom, photos, photos_order_by: 'position' })}`, { headers: as(undefined, 'visitor') })
      return response.json()
    }
    const close = await map('10')
    expect(names(close.photos[2])).toEqual(['b1'])
  })
})
