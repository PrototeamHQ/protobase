import { describe, expect, it } from 'vitest'
import type { MapLayerModel } from '@protobase/client'
import { chosenMapLayer, mapLayerStorageKey, readMapLayer, writeMapLayer } from './map-layer-choice'

const memory = () => {
  const data = new Map<string, string>()
  return { data, getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => void data.set(key, value), removeItem: (key: string) => void data.delete(key) }
}

const blocked = () => {
  throw new DOMException('blocked', 'SecurityError')
}
const unavailable = { getItem: blocked, setItem: blocked, removeItem: blocked }

const layers: MapLayerModel[] = [
  { id: 'aerial_nl', label: 'Aerial (NL)', tiles: 'https://tiles.example.com/nl/{z}/{x}/{y}.jpeg', attribution: 'NL' },
  { id: 'aerial_es', label: 'Aerial (ES)', tiles: 'https://tiles.example.com/es/{z}/{x}/{y}.jpeg', attribution: 'ES' },
]

describe('the chosen map layer', () => {
  it('is the layer of the stored id', () => {
    expect(chosenMapLayer(layers, 'aerial_es')?.label).toBe('Aerial (ES)')
  })

  it('is the default map without a choice, or for a layer the app no longer offers', () => {
    expect(chosenMapLayer(layers, null)).toBeUndefined()
    expect(chosenMapLayer(layers, 'aerial_be')).toBeUndefined()
    expect(chosenMapLayer([], 'aerial_nl')).toBeUndefined()
  })
})

describe('the map layer in storage', () => {
  it('stores a layer by id and forgets it for the default map', () => {
    const storage = memory()
    expect(readMapLayer(storage)).toBeNull()
    writeMapLayer(storage, 'aerial_nl')
    expect(storage.data.get(mapLayerStorageKey)).toBe('aerial_nl')
    expect(readMapLayer(storage)).toBe('aerial_nl')
    writeMapLayer(storage, undefined)
    expect(storage.data.size).toBe(0)
  })

  it('reads as the default map when storage is unavailable', () => {
    expect(readMapLayer(unavailable)).toBeNull()
    expect(() => writeMapLayer(unavailable, 'aerial_nl')).not.toThrow()
  })
})
