import { sql, type SqlBool } from 'kysely'
import type { CheckedFilter, ResourceModel } from '@protobase/schema'
import { baseQuery } from './base-query'
import { columnRef, requireField } from './columns'
import type { Db } from './db'
import { QueryError } from './errors'
import { assertFilterRequirements } from './filter-requirements'
import { toNumber } from './numbers'
import type { Scope } from './scope'

/** MapLibre's zoom levels, from the whole world at 0 to a building at 22. */
export const maxMapZoom = 22
/** About how many pixels across a bucket's cell is on the map. */
export const mapCellPixels = 64
/** The most buckets one request returns, the fullest first; a large screen's map holds fewer cells. */
export const maxMapBuckets = 1000

// MapLibre draws the world 512 pixels wide at zoom 0, twice as wide at each zoom after.
const worldPixels = 512
// Web Mercator ends here: the poles lie infinitely far north and south.
const maxLatitude = 85.051129
const coordinateTypes = ['integer', 'bigint', 'decimal']

/** The fields that hold a record's position, in decimal degrees. */
export type MapPosition = { latitude: string; longitude: string }

/** The corners of the records a bucket stands for, in decimal degrees. */
export type MapBounds = { south: number; west: number; north: number; east: number }

/** The records in one cell of the map's grid: how many, their mean position, and the bounds around them. */
export type MapBucket = { count: number; latitude: number; longitude: number; bounds: MapBounds }

/** The buckets, and how many records they hold together, the ones beyond `maxMapBuckets` included. */
export type MapBuckets = { total: number; buckets: MapBucket[] }

/** How many cells span the world's width, and its Web Mercator height, at a zoom. */
export const cellsAcross = (zoom: number) => (worldPixels * 2 ** zoom) / mapCellPixels

const coordinate = (model: ResourceModel, name: string) => {
  const target = requireField(model, name, 'filterable')
  if (!coordinateTypes.includes(target.type)) throw new QueryError('unsupported_field_type', `A position needs number fields, "${name}" is ${target.type}`)
  return target
}

/** The position's fields, refused unless each is a filterable number of degrees. */
export const checkMapPosition = (model: ResourceModel, position: MapPosition) => ({
  latitude: coordinate(model, position.latitude),
  longitude: coordinate(model, position.longitude),
})

/**
 * The matching records with a position, counted per cell of a grid that is square on the map at `zoom` (Web
 * Mercator, as MapLibre draws it) and about `mapCellPixels` across. The grid starts at the antimeridian and the north
 * edge, so a cell stays put as the map pans. Postgres groups the rows, so the filter can use the position's indexes.
 */
export const mapBuckets = async (db: Db, model: ResourceModel, position: MapPosition, zoom: number, filter?: CheckedFilter, scope?: Scope): Promise<MapBuckets> => {
  const fields = checkMapPosition(model, position)
  if (!Number.isInteger(zoom) || zoom < 0 || zoom > maxMapZoom) throw new QueryError('invalid_option', `zoom must be a whole number from 0 to ${maxMapZoom}`)
  await assertFilterRequirements(db, filter, scope)
  const latitude = sql`${columnRef(fields.latitude)}::float8`
  const longitude = sql`${columnRef(fields.longitude)}::float8`
  const cells = cellsAcross(zoom)
  const last = cells - 1
  const clamped = sql`least(greatest(${latitude}, ${-maxLatitude}::float8), ${maxLatitude}::float8)`
  const column = sql`least(floor((${longitude} + 180) / 360 * ${cells}::float8), ${last}::float8)`
  const row = sql`least(floor((1 - ln(tan(pi() / 4 + radians(${clamped}) / 2)) / pi()) / 2 * ${cells}::float8), ${last}::float8)`

  const rows = await baseQuery(db, model, filter, scope)
    .where(sql<SqlBool>`${columnRef(fields.latitude)} is not null and ${columnRef(fields.longitude)} is not null`)
    .select([
      sql<string>`count(*)::text`.as('n'),
      sql<string>`(sum(count(*)) over ())::text`.as('total'),
      sql<string>`avg(${latitude})::text`.as('latitude'),
      sql<string>`avg(${longitude})::text`.as('longitude'),
      sql<string>`min(${latitude})::text`.as('south'),
      sql<string>`min(${longitude})::text`.as('west'),
      sql<string>`max(${latitude})::text`.as('north'),
      sql<string>`max(${longitude})::text`.as('east'),
    ])
    .groupBy([column, row])
    .orderBy(sql`count(*)`, 'desc')
    .limit(maxMapBuckets)
    .execute()

  return {
    total: rows.length === 0 ? 0 : toNumber(rows[0]!.total),
    buckets: rows.map((bucket) => ({
      count: toNumber(bucket.n),
      latitude: toNumber(bucket.latitude),
      longitude: toNumber(bucket.longitude),
      bounds: { south: toNumber(bucket.south), west: toNumber(bucket.west), north: toNumber(bucket.north), east: toNumber(bucket.east) },
    })),
  }
}
