import { numeric, type Position } from './record-position'

/** The fields of a map display that say how exact a record's position is, and the circle it draws without one of its own. */
export type ApproximateFields = { approximate?: string; exact?: string; radius?: string; defaultRadius?: number; area?: string }

type Ring = [number, number][]

/** What a map draws around an approximate position: GeoJSON polygons, or lines such as a street, in longitude and latitude. */
export type AreaGeometry =
  | { type: 'Polygon'; coordinates: Ring[] }
  | { type: 'MultiPolygon'; coordinates: Ring[][] }
  | { type: 'LineString'; coordinates: Ring }
  | { type: 'MultiLineString'; coordinates: Ring[] }

// The mean radius of the Earth, in metres, as GeoJSON's WGS84 positions are measured on it.
const earthRadius = 6_371_008.8
// Corners of the polygon a circle is drawn as: round at any size it is drawn at.
const circleCorners = 64

/** Whether the record's position is approximate, as its field states; without one, or a value that says neither, it is not. */
export const isApproximate = (record: Record<string, unknown>, fields: ApproximateFields) => {
  if (fields.approximate !== undefined) return record[fields.approximate] === true
  if (fields.exact !== undefined) return record[fields.exact] === false
  return false
}

/** The polygon of `metres` around `center`, its corners as far from it along the globe. */
export const circleArea = (center: Position, metres: number): AreaGeometry => {
  const distance = metres / earthRadius
  const latitude = (center.latitude * Math.PI) / 180
  const longitude = (center.longitude * Math.PI) / 180
  const ring: Ring = Array.from({ length: circleCorners + 1 }, (_, index) => {
    const bearing = ((index % circleCorners) / circleCorners) * 2 * Math.PI
    const to = Math.asin(Math.sin(latitude) * Math.cos(distance) + Math.cos(latitude) * Math.sin(distance) * Math.cos(bearing))
    const across = longitude + Math.atan2(Math.sin(bearing) * Math.sin(distance) * Math.cos(latitude), Math.cos(distance) - Math.sin(latitude) * Math.sin(to))
    return [(across * 180) / Math.PI, (to * 180) / Math.PI]
  })
  return { type: 'Polygon', coordinates: [ring] }
}

const isPosition = (value: unknown): value is [number, number] =>
  Array.isArray(value) && value.length >= 2 && typeof value[0] === 'number' && typeof value[1] === 'number' && Math.abs(value[0]) <= 180 && Math.abs(value[1]) <= 90

const isLine = (value: unknown, least: number): value is Ring => Array.isArray(value) && value.length >= least && value.every(isPosition)
const isPolygon = (value: unknown): value is Ring[] => Array.isArray(value) && value.length > 0 && value.every((ring) => isLine(ring, 4))
const isLines = (value: unknown): value is Ring[] => Array.isArray(value) && value.length > 0 && value.every((line) => isLine(line, 2))

// GeoJSON comes as data from a json field, or as its text from a text field.
const parsed = (value: unknown): unknown => {
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value)
  } catch (error) {
    if (error instanceof SyntaxError) return undefined
    throw error
  }
}

/** The GeoJSON polygon or line a value holds, as a geometry or a feature of one; none for anything else, such as a point or text that is no GeoJSON. */
export const areaGeometry = (value: unknown): AreaGeometry | undefined => {
  const data = parsed(value)
  if (typeof data !== 'object' || data === null) return undefined
  const geometry = (data as { type?: unknown }).type === 'Feature' ? (data as { geometry?: unknown }).geometry : data
  if (typeof geometry !== 'object' || geometry === null) return undefined
  const { type, coordinates } = geometry as { type?: unknown; coordinates?: unknown }
  if (type === 'Polygon' && isPolygon(coordinates)) return { type, coordinates }
  if (type === 'MultiPolygon' && Array.isArray(coordinates) && coordinates.length > 0 && coordinates.every(isPolygon)) return { type, coordinates }
  if (type === 'LineString' && isLine(coordinates, 2)) return { type, coordinates }
  if (type === 'MultiLineString' && isLines(coordinates)) return { type, coordinates }
  return undefined
}

/**
 * What the map draws around the record's approximate position: the area its field holds, else a circle of the radius
 * its field holds, else one of the display's default radius. An exact position, or one whose record states none of
 * them on a display without a default, has none.
 */
export const positionArea = (record: Record<string, unknown>, fields: ApproximateFields, position: Position): AreaGeometry | undefined => {
  if (!isApproximate(record, fields)) return undefined
  const area = fields.area === undefined ? undefined : areaGeometry(record[fields.area])
  if (area) return area
  const radius = fields.radius === undefined ? undefined : numeric(record[fields.radius])
  if (radius !== undefined && Number.isFinite(radius) && radius > 0) return circleArea(position, radius)
  return fields.defaultRadius === undefined ? undefined : circleArea(position, fields.defaultRadius)
}
