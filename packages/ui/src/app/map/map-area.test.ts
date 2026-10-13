import { describe, expect, it } from 'vitest'
import { checkFilter, f, parseFilter, printFilter, resource } from '@protobase/schema'
import { areaFilter, boundsAround, boundsFilter, requestZoom } from './map-area'

const fields = { latitude: 'lat', longitude: 'lng' }
const places = resource('places')
  .table('places')
  .fields({ id: f.integer(), lat: f.decimal({ precision: 8, scale: 6 }).filterable(), lng: f.decimal({ precision: 9, scale: 6 }).filterable(), rooms: f.integer().filterable() })
  .primaryKey((r) => r.id)
  .toModel()
const text = (bounds: { south: number; west: number; north: number; east: number }) => printFilter(boundsFilter(fields, bounds))

describe('boundsFilter', () => {
  it('takes the records between the latitudes and longitudes of the bounds, rounded outwards to six decimals', () => {
    expect(text({ south: 52.3412345678, west: 4.8112345678, north: 52.4187654321, east: 4.9787654321 })).toBe('lat >= 52.341234 AND lat <= 52.418766 AND lng >= 4.811234 AND lng <= 4.978766')
  })

  it('takes the longitudes on both sides of the antimeridian when the view crosses it', () => {
    expect(text({ south: -20, west: 170, north: -10, east: 190 })).toBe('lat >= -20 AND lat <= -10 AND (lng >= 170 OR lng <= -170)')
    expect(text({ south: -20, west: -200, north: -10, east: -170 })).toBe('lat >= -20 AND lat <= -10 AND (lng >= 160 OR lng <= -170)')
  })

  it('takes every longitude when the view goes around the world, and no latitude past the poles', () => {
    expect(text({ south: -120, west: -300, north: 120, east: 300 })).toBe('lat >= -90 AND lat <= 90')
  })
})

describe('areaFilter', () => {
  it("narrows the list's filter to the bounds, as a filter the list API reads", () => {
    const bounds = { south: 52, west: 4, north: 53, east: 5 }
    const combined = areaFilter('rooms >= 3 OR search("garden")', fields, bounds)
    expect(combined).toBe('(rooms >= 3 OR search("garden")) AND lat >= 52 AND lat <= 53 AND lng >= 4 AND lng <= 5')
    const parsed = parseFilter(combined)
    expect(parsed.ok && parsed.ast && checkFilter({ ...places, search: ['id'] }, parsed.ast).ok).toBe(true)
    expect(areaFilter(' ', fields, bounds)).toBe('lat >= 52 AND lat <= 53 AND lng >= 4 AND lng <= 5')
  })
})

describe('requestZoom', () => {
  it('asks at the whole zoom level the map is at, within the levels MapLibre has', () => {
    expect(requestZoom(9.99)).toBe(9)
    expect(requestZoom(-0.5)).toBe(0)
    expect(requestZoom(24)).toBe(22)
  })
})

describe('boundsAround', () => {
  it('spans the records and the buckets, or nothing without either', () => {
    const bucket = { count: 300, latitude: 52.37, longitude: 4.89, bounds: { south: 52.3, west: 4.7, north: 52.45, east: 5.0 } }
    expect(boundsAround([{ latitude: 51.9, longitude: 4.48 }], [bucket])).toEqual({ south: 51.9, west: 4.48, north: 52.45, east: 5.0 })
    expect(boundsAround([{ latitude: 51.9, longitude: 4.48 }], [])).toEqual({ south: 51.9, west: 4.48, north: 51.9, east: 4.48 })
    expect(boundsAround([], [])).toBeUndefined()
  })
})
