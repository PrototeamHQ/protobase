import { describe, expect, it } from 'vitest'
import { mapSettings, mapStyleUrl } from './map-settings'

describe('mapStyleUrl', () => {
  it('is the style set, the option over the environment', () => {
    expect(mapStyleUrl({ style: 'https://tiles.example.com/style.json' }, { PROTOBASE_MAP_STYLE_URL: 'https://other.example.com/style.json' })).toBe('https://tiles.example.com/style.json')
    expect(mapStyleUrl(undefined, { PROTOBASE_MAP_STYLE_URL: ' http://localhost:8080/style.json ' })).toBe('http://localhost:8080/style.json')
  })

  it('is off without a style, or when the option is false', () => {
    expect(mapStyleUrl(undefined, {})).toBeUndefined()
    expect(mapStyleUrl({}, { PROTOBASE_MAP_STYLE_URL: ' ' })).toBeUndefined()
    expect(mapStyleUrl(false, { PROTOBASE_MAP_STYLE_URL: 'https://tiles.example.com/style.json' })).toBeUndefined()
  })

  it('refuses a value that is no http(s) URL, naming where it came from', () => {
    expect(() => mapStyleUrl(undefined, { PROTOBASE_MAP_STYLE_URL: 'tiles.example.com/style.json' })).toThrow('PROTOBASE_MAP_STYLE_URL is not a URL')
    expect(() => mapStyleUrl({ style: 'pmtiles://tiles.example.com/world.pmtiles' }, {})).toThrow('options.maps.style must start with https:// or http://, not pmtiles://')
  })
})

describe('mapSettings', () => {
  const layer = { id: 'aerial_nl', label: 'Aerial', tiles: 'https://tiles.example.com/{z}/{x}/{y}.jpeg', attribution: 'Tiles CC BY 4.0' }

  it('is the style with its layers, and the style alone without any', () => {
    expect(mapSettings({ style: 'https://tiles.example.com/style.json', layers: [layer] }, {})).toEqual({ style: 'https://tiles.example.com/style.json', layers: [layer] })
    expect(mapSettings({ layers: [] }, { PROTOBASE_MAP_STYLE_URL: 'https://tiles.example.com/style.json' })).toEqual({ style: 'https://tiles.example.com/style.json' })
  })

  it('is off without a style, layers or not', () => {
    expect(mapSettings({ layers: [layer] }, {})).toBeUndefined()
    expect(mapSettings(false, { PROTOBASE_MAP_STYLE_URL: 'https://tiles.example.com/style.json' })).toBeUndefined()
  })

  it('checks the layers even without a style', () => {
    expect(() => mapSettings({ layers: [{ ...layer, id: 'Aerial' }] }, {})).toThrow('options.maps.layers[0].id')
  })
})
