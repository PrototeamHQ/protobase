import { createWhere, printFilter, type FilterExpr } from '@protobase/schema'
import type { MapBounds, MapBucket } from '@protobase/client'
import type { Position } from './record-position'

const where = createWhere()

/** What a map shows: the bounds of its view, in decimal degrees, and its zoom. */
export type MapArea = { bounds: MapBounds; zoom: number }

/** The whole world from as far out as a map goes: what a map asks for before it knows where its records are. */
export const worldArea: MapArea = { bounds: { south: -90, west: -180, north: 90, east: 180 }, zoom: 0 }

// MapLibre's zoom levels, from the whole world at 0 to a building at 22.
const maxZoom = 22

// Six decimals of a degree are about ten centimetres; rounding outwards keeps every record in view inside the box.
const down = (degrees: number) => Math.floor(degrees * 1e6) / 1e6
const up = (degrees: number) => Math.ceil(degrees * 1e6) / 1e6

// MapLibre counts on past the antimeridian when the map shows it, such as 190 for -170.
const wrapped = (longitude: number) => ((((longitude + 180) % 360) + 360) % 360) - 180

/**
 * The AIP-160 filter for the records inside `bounds`: between its latitudes, and between its longitudes on the globe.
 * A view across the antimeridian takes the longitudes on both sides of it, and one around the whole world takes them all.
 */
export const boundsFilter = (fields: { latitude: string; longitude: string }, bounds: MapBounds): FilterExpr => {
  const latitude = [where.gte(fields.latitude, down(Math.max(bounds.south, -90))), where.lte(fields.latitude, up(Math.min(bounds.north, 90)))]
  if (bounds.east - bounds.west >= 360) return where.and(...latitude)
  const west = where.gte(fields.longitude, down(wrapped(bounds.west)))
  const east = where.lte(fields.longitude, up(wrapped(bounds.east)))
  return wrapped(bounds.west) <= wrapped(bounds.east) ? where.and(...latitude, west, east) : where.and(...latitude, where.or(west, east))
}

/** The list's filter, its search included, narrowed to the records inside the map's bounds. */
export const areaFilter = (listFilter: string, fields: { latitude: string; longitude: string }, bounds: MapBounds) => {
  const inside = printFilter(boundsFilter(fields, bounds))
  return listFilter.trim() === '' ? inside : `(${listFilter}) AND ${inside}`
}

/** The zoom the records are asked for at: the whole zoom level the map is at. */
export const requestZoom = (zoom: number) => Math.min(Math.max(Math.floor(zoom), 0), maxZoom)

/** The bounds around the records and the buckets, or none without either. */
export const boundsAround = (points: Position[], buckets: MapBucket[]): MapBounds | undefined => {
  const corners = [
    ...points.map((point) => ({ south: point.latitude, west: point.longitude, north: point.latitude, east: point.longitude })),
    ...buckets.map((bucket) => bucket.bounds),
  ]
  if (corners.length === 0) return undefined
  return {
    south: Math.min(...corners.map((corner) => corner.south)),
    west: Math.min(...corners.map((corner) => corner.west)),
    north: Math.max(...corners.map((corner) => corner.north)),
    east: Math.max(...corners.map((corner) => corner.east)),
  }
}
