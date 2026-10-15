import { describe, expect, it } from 'vitest'
import { areaGeometry, circleArea, isApproximate, positionArea } from './approximate-position'

const at = { latitude: 52.37, longitude: 4.89 }
const street = { type: 'LineString', coordinates: [[4.889, 52.369], [4.891, 52.371]] }
const block = { type: 'Polygon', coordinates: [[[4.88, 52.36], [4.9, 52.36], [4.9, 52.38], [4.88, 52.36]]] }

// The distance between two positions along the globe, in metres.
const metresBetween = (a: [number, number], b: [number, number]) => {
  const rad = (degrees: number) => (degrees * Math.PI) / 180
  const h = Math.sin(rad(b[1] - a[1]) / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(rad(b[0] - a[0]) / 2) ** 2
  return 2 * 6_371_008.8 * Math.asin(Math.sqrt(h))
}

describe('isApproximate', () => {
  it('reads the field the display names, true when approximate or false when exact', () => {
    expect(isApproximate({ near: true }, { approximate: 'near' })).toBe(true)
    expect(isApproximate({ near: false }, { approximate: 'near' })).toBe(false)
    expect(isApproximate({ exact: false }, { exact: 'exact' })).toBe(true)
    expect(isApproximate({ exact: true }, { exact: 'exact' })).toBe(false)
  })

  it('does not call a position approximate when nothing says so', () => {
    expect(isApproximate({ near: true }, {})).toBe(false)
    expect(isApproximate({ near: null }, { approximate: 'near' })).toBe(false)
    expect(isApproximate({ exact: null }, { exact: 'exact' })).toBe(false)
    expect(isApproximate({}, { exact: 'exact' })).toBe(false)
  })
})

describe('circleArea', () => {
  it('draws a closed polygon whose corners are the radius away from the centre', () => {
    const circle = circleArea(at, 250)
    expect(circle.type).toBe('Polygon')
    const ring = (circle.coordinates as [number, number][][])[0]!
    expect(ring.length).toBe(65)
    expect(ring[0]).toEqual(ring.at(-1))
    for (const corner of ring) expect(metresBetween([at.longitude, at.latitude], corner)).toBeCloseTo(250, 3)
  })
})

describe('areaGeometry', () => {
  it('takes a GeoJSON polygon or line, as data, as text, or as a feature of one', () => {
    expect(areaGeometry(block)).toEqual(block)
    expect(areaGeometry(JSON.stringify(street))).toEqual(street)
    expect(areaGeometry({ type: 'Feature', properties: {}, geometry: street })).toEqual(street)
    const lines = { type: 'MultiLineString', coordinates: [street.coordinates] }
    expect(areaGeometry(lines)).toEqual(lines)
    const blocks = { type: 'MultiPolygon', coordinates: [block.coordinates] }
    expect(areaGeometry(blocks)).toEqual(blocks)
  })

  it('takes nothing else: a point, broken text, positions off the globe or an open ring', () => {
    expect(areaGeometry({ type: 'Point', coordinates: [4.89, 52.37] })).toBeUndefined()
    expect(areaGeometry('{"type": "Polygon"')).toBeUndefined()
    expect(areaGeometry('Prinsengracht')).toBeUndefined()
    expect(areaGeometry({ type: 'LineString', coordinates: [[4.89, 52.37], [190, 52.37]] })).toBeUndefined()
    expect(areaGeometry({ type: 'LineString', coordinates: [[4.89, 52.37]] })).toBeUndefined()
    expect(areaGeometry({ type: 'LineString', coordinates: [['4.89', '52.37'], [4.9, 52.38]] })).toBeUndefined()
    expect(areaGeometry({ type: 'Polygon', coordinates: [[[4.88, 52.36], [4.9, 52.36], [4.88, 52.36]]] })).toBeUndefined()
    expect(areaGeometry(null)).toBeUndefined()
    expect(areaGeometry(12)).toBeUndefined()
  })
})

describe('positionArea', () => {
  const fields = { exact: 'exact', radius: 'accuracy', area: 'outline' }

  it('draws the area the record states, else a circle of its radius, else one of the display default', () => {
    expect(positionArea({ exact: false, outline: street, accuracy: 100 }, fields, at)).toEqual(street)
    expect(positionArea({ exact: false, outline: null, accuracy: '100' }, fields, at)).toEqual(circleArea(at, 100))
    expect(positionArea({ exact: false, outline: 'no GeoJSON', accuracy: 100 }, fields, at)).toEqual(circleArea(at, 100))
    expect(positionArea({ exact: false }, { ...fields, defaultRadius: 300 }, at)).toEqual(circleArea(at, 300))
  })

  it('invents none: an exact position, or an approximate one that states none on a display without a default, has none', () => {
    expect(positionArea({ exact: true, outline: street, accuracy: 100 }, fields, at)).toBeUndefined()
    expect(positionArea({ exact: false, outline: null, accuracy: null }, fields, at)).toBeUndefined()
    expect(positionArea({ exact: false, accuracy: 0 }, fields, at)).toBeUndefined()
    expect(positionArea({ exact: false, accuracy: -5 }, fields, at)).toBeUndefined()
    expect(positionArea({ exact: null }, { ...fields, defaultRadius: 300 }, at)).toBeUndefined()
  })
})
