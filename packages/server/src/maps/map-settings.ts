import { checkedUrl } from '../checked-url'

/**
 * `style`: the URL of the MapLibre style the app draws its maps with (`l.map`), such as one of self-hosted PMTiles
 * (`pmtiles://` sources). Falls back to `PROTOBASE_MAP_STYLE_URL`.
 */
export type MapOptions = { style?: string }

export const mapStyleVariable = 'PROTOBASE_MAP_STYLE_URL'

/** The map style, when one is set and the option is not `false`. A value that is no http(s) URL stops the server at startup. */
export const mapStyleUrl = (option: MapOptions | false | undefined, env: Record<string, string | undefined>) => {
  if (option === false) return undefined
  const url = (option?.style ?? env[mapStyleVariable])?.trim()
  if (!url) return undefined
  return checkedUrl(url, option?.style === undefined ? mapStyleVariable : 'options.maps.style')
}
