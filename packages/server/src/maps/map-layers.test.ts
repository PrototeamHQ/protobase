import { describe, expect, it } from 'vitest'
import { checkedMapLayers, type MapLayer } from './map-layers'

const aerial: MapLayer = { id: 'aerial_nl', label: 'Aerial', tiles: 'https://tiles.example.com/{z}/{x}/{y}.jpeg', attribution: 'Tiles CC BY 4.0' }

describe('checkedMapLayers', () => {
  it('keeps valid layers, trimmed, with their bounds and maxzoom', () => {
    expect(checkedMapLayers([{ ...aerial, label: ' Aerial ', bounds: [3.2, 50.7, 7.3, 53.6], maxzoom: 20 }])).toEqual([{ ...aerial, bounds: [3.2, 50.7, 7.3, 53.6], maxzoom: 20 }])
    expect(checkedMapLayers([{ ...aerial, tiles: 'https://wmts.example.com/wmts?tilematrix={z}&tilerow={y}&tilecol={x}' }])[0]!.tiles).toContain('tilerow={y}')
    expect(checkedMapLayers([])).toEqual([])
  })

  it('refuses an id that is not lowercase letters, digits and _, or one used twice', () => {
    expect(() => checkedMapLayers([{ ...aerial, id: 'Aerial-NL' }])).toThrow('options.maps.layers[0].id must be lowercase letters, digits and _')
    expect(() => checkedMapLayers([aerial, { ...aerial, label: 'Other' }])).toThrow('the id aerial_nl is used twice')
  })

  it('refuses a layer without a label or attribution', () => {
    expect(() => checkedMapLayers([{ ...aerial, label: ' ' }])).toThrow('options.maps.layers[0].label')
    expect(() => checkedMapLayers([{ ...aerial, attribution: '' }])).toThrow('options.maps.layers[0].attribution')
  })

  it('refuses tiles that are no http(s) URL or lack a placeholder', () => {
    expect(() => checkedMapLayers([{ ...aerial, tiles: 'tiles.example.com/{z}/{x}/{y}' }])).toThrow('options.maps.layers[0].tiles must be an https:// or http:// URL')
    expect(() => checkedMapLayers([{ ...aerial, tiles: 'pmtiles://tiles.example.com/{z}/{x}/{y}' }])).toThrow('must be an https:// or http:// URL')
    expect(() => checkedMapLayers([{ ...aerial, tiles: 'https://tiles.example.com/{z}/{x}.jpeg' }])).toThrow('must hold {y}')
  })

  it('refuses bounds out of order or range, and a maxzoom past 24', () => {
    expect(() => checkedMapLayers([{ ...aerial, bounds: [7.3, 50.7, 3.2, 53.6] }])).toThrow('options.maps.layers[0].bounds')
    expect(() => checkedMapLayers([{ ...aerial, bounds: [3.2, 50.7, 7.3, 95] }])).toThrow('options.maps.layers[0].bounds')
    expect(() => checkedMapLayers([{ ...aerial, bounds: [3.2, 50.7] as never }])).toThrow('options.maps.layers[0].bounds')
    expect(() => checkedMapLayers([{ ...aerial, maxzoom: 25 }])).toThrow('options.maps.layers[0].maxzoom')
    expect(() => checkedMapLayers([{ ...aerial, maxzoom: 19.5 }])).toThrow('options.maps.layers[0].maxzoom')
  })
})
