import type { ExpressionSpecification, FilterSpecification } from 'maplibre-gl'
import { Layer, Source } from 'react-map-gl/maplibre'
import type { MapPoint } from '../displays/map-groups'
import { areaFeatures, fadeIn } from './area-features'

/** The colours of the areas, as MapLibre reads them: the markers' own, and the chosen marker's. */
export type AreaColors = { area: string; chosen: string }

/** The areas' lowest layer, which a layer of tiles goes under. */
export const areaLayerId = 'position-area-fills'

const polygons: FilterSpecification = ['==', ['get', 'kind'], 'polygon']
const lines: FilterSpecification = ['==', ['get', 'kind'], 'line']
const chosen = (yes: number, no: number): ExpressionSpecification => ['case', ['get', 'chosen'], yes, no]

/**
 * The areas around the approximate positions among `points`, drawn under the markers in the markers' colour: a polygon
 * filled faintly within a dashed outline, a line such as a street as a wide stroke. Each fades in as the map zooms close
 * enough for it to be larger than a marker, and the chosen records' areas are drawn darker. Nothing without areas.
 */
export const PositionAreas = ({ points, selected, colors }: { points: MapPoint[]; selected: string[] | undefined; colors: AreaColors }) => {
  const data = areaFeatures(points, selected)
  if (data.features.length === 0) return null
  const color: ExpressionSpecification = ['case', ['get', 'chosen'], colors.chosen, colors.area]
  return (
    <Source id="position-areas" type="geojson" data={data}>
      <Layer id={areaLayerId} type="fill" filter={polygons} paint={{ 'fill-color': color, 'fill-opacity': fadeIn(chosen(0.15, 0.1)) }} />
      <Layer id="position-area-outlines" type="line" filter={polygons} paint={{ 'line-color': color, 'line-width': 1.5, 'line-dasharray': [3, 2], 'line-opacity': fadeIn(0.8) }} />
      <Layer id="position-area-lines" type="line" filter={lines} layout={{ 'line-cap': 'round', 'line-join': 'round' }} paint={{ 'line-color': color, 'line-width': 6, 'line-opacity': fadeIn(chosen(0.6, 0.35)) }} />
    </Source>
  )
}
