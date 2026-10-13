import { describe, expect, it } from 'vitest'
import { groupPoints, keptSelection, mapPoints, stepSelection } from './map-groups'

const row = (key: string, record: Record<string, unknown>) => ({ key, record, labels: {} })

describe('mapPoints', () => {
  it('keeps the rows with a position, decimals as text included', () => {
    const rows = [row('1', { lat: '52.370216', lng: '4.885168' }), row('2', { lat: null, lng: '4.9' }), row('3', { lat: 40.4, lng: -3.7 }), row('4', { lat: '95', lng: '4' })]
    expect(mapPoints(rows, { latitude: 'lat', longitude: 'lng' })).toEqual([
      { key: '1', latitude: 52.370216, longitude: 4.885168 },
      { key: '3', latitude: 40.4, longitude: -3.7 },
    ])
  })
})

describe('groupPoints', () => {
  it('puts the points within the radius of a marker under it, in order, and the others under markers of their own', () => {
    const points = [
      { key: 'a', x: 100, y: 100 },
      { key: 'b', x: 110, y: 105 },
      { key: 'c', x: 300, y: 100 },
      { key: 'd', x: 95, y: 90 },
    ]
    expect(groupPoints(points, 20)).toEqual([
      { keys: ['a', 'b', 'd'], at: 'a' },
      { keys: ['c'], at: 'c' },
    ])
    expect(groupPoints(points, 5)).toHaveLength(4)
  })
})

describe('keptSelection and stepSelection', () => {
  it('keeps the selected records the list still has, on the same card', () => {
    const rows = [row('a', {}), row('c', {})]
    expect(keptSelection({ keys: ['a', 'b', 'c'], index: 2 }, rows)).toEqual({ keys: ['a', 'c'], index: 1 })
    expect(keptSelection({ keys: ['a', 'b', 'c'], index: 1 }, rows)).toEqual({ keys: ['a', 'c'], index: 0 })
    expect(keptSelection({ keys: ['b'], index: 0 }, rows)).toBeUndefined()
    expect(keptSelection(undefined, rows)).toBeUndefined()
  })

  it('steps round through the records', () => {
    expect(stepSelection({ keys: ['a', 'b', 'c'], index: 2 }, 1)).toEqual({ keys: ['a', 'b', 'c'], index: 0 })
    expect(stepSelection({ keys: ['a', 'b', 'c'], index: 0 }, -1)).toEqual({ keys: ['a', 'b', 'c'], index: 2 })
  })
})
