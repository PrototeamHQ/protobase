import { Kysely } from 'kysely'
import { PGliteDialect } from 'kysely-pglite-dialect'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { countUpTo } from '../src/count-up-to'
import { cellsAcross, mapBuckets, maxMapZoom } from '../src/map-buckets'
import { createEmptyPg } from '../../../test-support/pglite-snapshot'
import { check, field, model } from '../../../test-support/query'

const places = model('places', ['id'], [
  field('id', 'integer'),
  field('lat', 'decimal', { nullable: true }),
  field('lng', 'decimal', { nullable: true }),
  field('kind', 'text'),
  field('grid', 'integer', { filterable: false }),
  field('deleted_at', 'timestamp', { nullable: true, filterable: false }),
], { softDelete: 'deleted_at' })

// 30 places a few hundred metres apart in Amsterdam, 20 in London, 5 in Sydney, 2 without a position and 1 deleted
const ddl = `
create table places (id integer generated always as identity primary key, lat numeric(8, 6), lng numeric(9, 6), kind text not null, grid integer not null default 0, deleted_at timestamptz);
insert into places (lat, lng, kind) select 52.37 + i * 0.0001, 4.89 + i * 0.0001, case when i % 2 = 0 then 'flat' else 'house' end from generate_series(0, 29) i;
insert into places (lat, lng, kind) select 51.5 + i * 0.0001, -0.127 + i * 0.0001, 'flat' from generate_series(0, 19) i;
insert into places (lat, lng, kind) select -33.87 + i * 0.0001, 151.21, 'house' from generate_series(0, 4) i;
insert into places (lat, lng, kind) values (null, 4.9, 'flat'), (52.4, null, 'flat');
insert into places (lat, lng, kind, deleted_at) values (52.37, 4.89, 'flat', now());
`

let db: Kysely<any>
beforeAll(async () => {
  const pg = await createEmptyPg()
  await pg.exec(ddl)
  db = new Kysely({ dialect: new PGliteDialect(pg) })
})
afterAll(async () => { await db.destroy() })

const position = { latitude: 'lat', longitude: 'lng' }
const sum = (buckets: { count: number }[]) => buckets.reduce((total, bucket) => total + bucket.count, 0)
const near = (latitude: number, longitude: number) => (bucket: { latitude: number; longitude: number }) => Math.abs(bucket.latitude - latitude) < 0.1 && Math.abs(bucket.longitude - longitude) < 0.1

describe('cellsAcross', () => {
  it('spans the world in cells of about 64 pixels, twice as many at each zoom', () => {
    expect(cellsAcross(0)).toBe(8)
    expect(cellsAcross(1)).toBe(16)
    expect(cellsAcross(10)).toBe(8192)
  })
})

describe('mapBuckets', () => {
  it('counts the records with a position per cell, with their mean position and the bounds around them', async () => {
    const { total, buckets } = await mapBuckets(db, places, position, 8)
    expect(total).toBe(55)
    expect(sum(buckets)).toBe(55)
    const amsterdam = buckets.find(near(52.37, 4.89))!
    expect(amsterdam.count).toBe(30)
    expect(amsterdam.latitude).toBeCloseTo(52.37145, 6)
    expect(amsterdam.longitude).toBeCloseTo(4.89145, 6)
    expect(amsterdam.bounds).toEqual({ south: 52.37, west: 4.89, north: 52.3729, east: 4.8929 })
    expect(buckets.find(near(51.5, -0.127))?.count).toBe(20)
    expect(buckets.find(near(-33.87, 151.21))?.count).toBe(5)
  })

  it('puts more of the same records in cells of their own as the zoom grows', async () => {
    const amsterdam = check(places, 'lat >= 52 AND lat <= 53 AND lng >= 4 AND lng <= 5')
    expect((await mapBuckets(db, places, position, 10, amsterdam)).buckets).toHaveLength(1)
    const close = await mapBuckets(db, places, position, 18, amsterdam)
    expect(close.buckets.length).toBeGreaterThan(5)
    expect(close.total).toBe(30)
    expect(sum(close.buckets)).toBe(30)
  })

  it('keeps a cell where it is as the bounding box moves, so panning does not regroup the records', async () => {
    const world = await mapBuckets(db, places, position, 17)
    const box = await mapBuckets(db, places, position, 17, check(places, 'lat >= 52.371 AND lat <= 53 AND lng >= 4 AND lng <= 5'))
    const key = (bucket: { bounds: object; count: number }) => JSON.stringify(bucket)
    const inside = world.buckets.filter((bucket) => bucket.bounds.south >= 52.371 && bucket.bounds.north <= 53)
    expect(box.buckets.map(key).sort()).toEqual(inside.map(key).sort())
  })

  it('applies the filter and leaves out deleted records', async () => {
    const flats = await mapBuckets(db, places, position, 3, check(places, 'kind = "flat"'))
    expect(flats.total).toBe(35)
    expect(flats.buckets.find(near(52.37, 4.89))?.count).toBe(15)
    expect(await mapBuckets(db, places, position, 3, check(places, 'kind = "castle"'))).toEqual({ total: 0, buckets: [] })
  })

  it('refuses a position that is no filterable number, and a zoom MapLibre has not', async () => {
    await expect(mapBuckets(db, places, { latitude: 'kind', longitude: 'lng' }, 3)).rejects.toMatchObject({ code: 'unsupported_field_type' })
    await expect(mapBuckets(db, places, { latitude: 'lat', longitude: 'grid' }, 3)).rejects.toMatchObject({ code: 'not_filterable' })
    await expect(mapBuckets(db, places, { latitude: 'lat', longitude: 'height' }, 3)).rejects.toMatchObject({ code: 'unknown_field' })
    await expect(mapBuckets(db, places, position, maxMapZoom + 1)).rejects.toMatchObject({ code: 'invalid_option' })
    await expect(mapBuckets(db, places, position, 2.5)).rejects.toMatchObject({ code: 'invalid_option' })
  })
})

describe('countUpTo', () => {
  it('counts the matching records, but no further than the limit', async () => {
    expect(await countUpTo(db, places, 1000)).toBe(57)
    expect(await countUpTo(db, places, 10)).toBe(10)
    expect(await countUpTo(db, places, 1000, check(places, 'kind = "house"'))).toBe(20)
  })
})
