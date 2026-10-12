import { describe, expect, it } from 'vitest'
import { mapStyleUrl } from './map-settings'

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
