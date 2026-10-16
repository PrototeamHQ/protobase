/**
 * A map of raster tiles that the maps' switch offers in place of the style's, such as aerial photos.
 * `id`: names the layer in the browser's memory of the choice, in lowercase letters, digits and `_`, like `aerial_nl`.
 * `label`: what the switch says.
 * `tiles`: the URL of its 256-pixel tiles in Web Mercator, with `{z}`, `{x}` and `{y}` where the zoom, column and row
 * go, as an XYZ service or a WMTS in its `GoogleMapsCompatible` (EPSG:3857) tile matrix set takes them.
 * `attribution`: the credit the tiles' licence asks for, shown in the map's corner while the layer is; it may hold links.
 * `bounds`: `[west, south, east, north]` in degrees, where the tiles are: elsewhere the style's map shows through.
 * `maxzoom`: the deepest zoom the tiles go to; the map enlarges them past it. Default 22.
 */
export type MapLayer = { id: string; label: string; tiles: string; attribution: string; bounds?: [number, number, number, number]; maxzoom?: number }

const idPattern = /^[a-z][a-z0-9_]*$/

const checkedBounds = (bounds: unknown, source: string) => {
  const valid = Array.isArray(bounds) && bounds.length === 4 && bounds.every((value) => typeof value === 'number' && Number.isFinite(value))
  if (!valid) throw new Error(`${source}.bounds must be [west, south, east, north] in degrees`)
  const [west, south, east, north] = bounds as [number, number, number, number]
  const inRange = west >= -180 && east <= 180 && south >= -90 && north <= 90 && west < east && south < north
  if (!inRange) throw new Error(`${source}.bounds must be [west, south, east, north] in degrees, west of east and south of north`)
  return [west, south, east, north] as [number, number, number, number]
}

const checkedLayer = (layer: MapLayer, index: number): MapLayer => {
  const source = `options.maps.layers[${index}]`
  if (typeof layer.id !== 'string' || !idPattern.test(layer.id)) throw new Error(`${source}.id must be lowercase letters, digits and _, like aerial_nl`)
  if (typeof layer.label !== 'string' || !layer.label.trim()) throw new Error(`${source}.label must say what the switch shows`)
  if (typeof layer.attribution !== 'string' || !layer.attribution.trim()) throw new Error(`${source}.attribution must credit the tiles as their licence asks`)
  const tiles = typeof layer.tiles === 'string' ? layer.tiles.trim() : ''
  if (!URL.canParse(tiles) || !['https:', 'http:'].includes(new URL(tiles).protocol)) throw new Error(`${source}.tiles must be an https:// or http:// URL`)
  const missing = ['{z}', '{x}', '{y}'].filter((placeholder) => !tiles.includes(placeholder))
  if (missing.length > 0) throw new Error(`${source}.tiles must hold ${missing.join(', ')} where the tile's zoom, column and row go`)
  const maxzoom = layer.maxzoom
  if (maxzoom !== undefined && !(Number.isInteger(maxzoom) && maxzoom >= 0 && maxzoom <= 24)) throw new Error(`${source}.maxzoom must be a whole number from 0 to 24`)
  return {
    id: layer.id,
    label: layer.label.trim(),
    tiles,
    attribution: layer.attribution.trim(),
    ...(layer.bounds !== undefined && { bounds: checkedBounds(layer.bounds, source) }),
    ...(maxzoom !== undefined && { maxzoom }),
  }
}

/** The layers as `/meta` names them; one that is not as `MapLayer` says, or a repeated id, stops the server at startup. */
export const checkedMapLayers = (layers: MapLayer[]) => {
  const checked = layers.map(checkedLayer)
  const repeated = checked.find((layer, index) => checked.findIndex((other) => other.id === layer.id) !== index)
  if (repeated) throw new Error(`options.maps.layers: the id ${repeated.id} is used twice`)
  return checked
}
