import type { ExpressionSpecification } from 'maplibre-gl'
import type { MapPoint } from '../displays/map-groups'
import type { AreaGeometry } from './approximate-position'

/** An area as the map's GeoJSON source holds it: whose it is, whether it is filled or a line, its size, and whether its record is chosen. */
export type AreaFeature = {
  type: 'Feature'
  geometry: AreaGeometry
  properties: { key: string; kind: 'polygon' | 'line'; span: number; chosen: boolean }
}

// MapLibre draws the whole world 512 pixels across at zoom 0, each zoom level twice as wide as the one before.
const worldPixels = 512
// The furthest north and south Web Mercator draws.
const mercatorLimit = 85.051129
// An area fades in as it grows from about half a marker to a marker and a half across, smaller it says nothing the marker does not.
const fadeFrom = 16
const fadeTo = 48
const zooms = Array.from({ length: 23 }, (_, zoom) => zoom)

const positionsOf = (geometry: AreaGeometry): [number, number][] => {
  if (geometry.type === 'LineString') return geometry.coordinates
  if (geometry.type === 'MultiPolygon') return geometry.coordinates.flat(2)
  return geometry.coordinates.flat()
}

// How far down the world a latitude is drawn, from 0 at the top to 1 at the bottom.
const mercatorY = (latitude: number) => {
  const radians = (Math.max(-mercatorLimit, Math.min(mercatorLimit, latitude)) * Math.PI) / 180
  return 0.5 - Math.log(Math.tan(Math.PI / 4 + radians / 2)) / (2 * Math.PI)
}

/** How many pixels across the area is drawn at zoom 0, the larger of its width and height; twice as many each zoom level in. */
export const zoomZeroSpan = (geometry: AreaGeometry) => {
  const positions = positionsOf(geometry)
  const longitudes = positions.map(([longitude]) => longitude)
  const ys = positions.map(([, latitude]) => mercatorY(latitude))
  const width = ((Math.max(...longitudes) - Math.min(...longitudes)) / 360) * worldPixels
  const height = (Math.max(...ys) - Math.min(...ys)) * worldPixels
  return Math.max(width, height)
}

/** The areas of the points that have one, those of the chosen records last so they are drawn on top. */
export const areaFeatures = (points: MapPoint[], selected: string[] | undefined): { type: 'FeatureCollection'; features: AreaFeature[] } => {
  const features = points.flatMap((point): AreaFeature[] => {
    if (!point.area) return []
    const kind = point.area.type === 'LineString' || point.area.type === 'MultiLineString' ? 'line' : 'polygon'
    return [{ type: 'Feature', geometry: point.area, properties: { key: point.key, kind, span: zoomZeroSpan(point.area), chosen: selected?.includes(point.key) ?? false } }]
  })
  return { type: 'FeatureCollection', features: [...features.filter((feature) => !feature.properties.chosen), ...features.filter((feature) => feature.properties.chosen)] }
}

/**
 * An opacity of `full` for an area drawn large enough to mean something at the zoom, fading in as it grows to that
 * size: at each whole zoom level its share of `full` follows from its span, and MapLibre blends between the levels.
 */
export const fadeIn = (full: number | ExpressionSpecification): ExpressionSpecification =>
  [
    'interpolate',
    ['linear'],
    ['zoom'],
    ...zooms.flatMap((zoom) => [zoom, ['*', full, ['min', 1, ['max', 0, ['/', ['-', ['*', ['get', 'span'], 2 ** zoom], fadeFrom], fadeTo - fadeFrom]]]]]),
  ] as ExpressionSpecification
