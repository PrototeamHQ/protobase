import { checkedUrl } from '../checked-url'
import { checkedMapLayers, type MapLayer } from './map-layers'

export type { MapLayer } from './map-layers'

/**
 * `style`: the URL of the MapLibre style the app draws its maps with (`l.map`), such as one of self-hosted PMTiles
 * (`pmtiles://` sources). Falls back to `PROTOBASE_MAP_STYLE_URL`.
 * `layers`: other maps of raster tiles, such as aerial photos, that a switch on every map offers in place of the
 * style's (see `MapLayer`). They need a style: without one there is no map to switch.
 */
export type MapOptions = { style?: string; layers?: MapLayer[] }

/** What `/meta` names: the style and the layers a map may switch to. */
export type MapSettings = { style: string; layers?: MapLayer[] }

export const mapStyleVariable = 'PROTOBASE_MAP_STYLE_URL'

/** The map style, when one is set and the option is not `false`. A value that is no http(s) URL stops the server at startup. */
export const mapStyleUrl = (option: MapOptions | false | undefined, env: Record<string, string | undefined>) => {
  if (option === false) return undefined
  const url = (option?.style ?? env[mapStyleVariable])?.trim()
  if (!url) return undefined
  return checkedUrl(url, option?.style === undefined ? mapStyleVariable : 'options.maps.style')
}

/**
 * The style and its layers, when there is a style. The layers are checked whether or not there is one, so a mistake in
 * them stops the server even where the style is not set.
 */
export const mapSettings = (option: MapOptions | false | undefined, env: Record<string, string | undefined>): MapSettings | undefined => {
  const layers = option ? checkedMapLayers(option.layers ?? []) : []
  const style = mapStyleUrl(option, env)
  if (!style) return undefined
  return { style, ...(layers.length > 0 && { layers }) }
}
