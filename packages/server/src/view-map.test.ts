import { describe, expect, it } from 'vitest'
import { f, resource, type MapSectionModel } from '@protobase/schema'
import { mapDisplayErrors, mapErrors } from './view-map'

const shops = resource('shops')
  .table('shops')
  .fields({ id: f.integer(), lat: f.decimal({ precision: 8, scale: 6 }), lng: f.decimal({ precision: 9, scale: 6 }), grid_x: f.integer(), grid_y: f.bigint(), name: f.text() })
  .primaryKey((r) => r.id)
  .toModel()

const map = (o: Partial<MapSectionModel> = {}): MapSectionModel => ({ kind: 'map', title: 'Location', latitude: 'lat', longitude: 'lng', ...o })

describe('mapErrors', () => {
  it('takes two number fields and a zoom MapLibre has', () => {
    expect(mapErrors(map(), shops)).toEqual([])
    expect(mapErrors(map({ latitude: 'grid_x', longitude: 'grid_y', zoom: 0 }), shops)).toEqual([])
    expect(mapErrors(map({ zoom: 22 }), shops)).toEqual([])
    expect(mapErrors(map({ zoom: 13.5 }), shops)).toEqual([])
  })

  it('refuses fields the resource does not have, or that hold no number', () => {
    expect(mapErrors(map({ latitude: 'latitude' }), shops)).toEqual(['unknown field "latitude" on shops'])
    expect(mapErrors(map({ longitude: 'name' }), shops)).toEqual(['"name" on shops is text, not a number of degrees'])
    expect(mapErrors(map({ latitude: 'toString' }), shops)).toEqual(['unknown field "toString" on shops'])
  })

  it('refuses a zoom outside 0 to 22', () => {
    expect(mapErrors(map({ zoom: -1 }), shops)).toEqual(['zoom -1 is not between 0 and 22'])
    expect(mapErrors(map({ zoom: 23 }), shops)).toEqual(['zoom 23 is not between 0 and 22'])
    expect(mapErrors(map({ zoom: Number.NaN }), shops)).toEqual(['zoom NaN is not between 0 and 22'])
  })
})

describe('mapDisplayErrors', () => {
  const places = resource('places')
    .table('places')
    .fields({ id: f.integer(), lat: f.decimal({ precision: 8, scale: 6 }).filterable(), lng: f.decimal({ precision: 9, scale: 6 }).filterable(), raw_lat: f.decimal({ precision: 8, scale: 6 }), name: f.text().filterable() })
    .primaryKey((r) => r.id)
    .toModel()
  const display = (o: { latitude?: string; longitude?: string } = {}) => ({ kind: 'map' as const, name: 'map', latitude: 'lat', longitude: 'lng', ...o })

  it('takes two filterable number fields, since it asks for the records inside its bounding box', () => {
    expect(mapDisplayErrors(display(), places)).toEqual([])
    expect(mapDisplayErrors(display({ latitude: 'raw_lat' }), places)).toEqual(['"raw_lat" on places is not filterable, and the map display filters by position'])
    expect(mapDisplayErrors(display({ longitude: 'name' }), places)).toEqual(['"name" on places is text, not a number of degrees'])
    expect(mapDisplayErrors(display({ longitude: 'toString' }), places)).toEqual(['unknown field "toString" on places'])
  })

  it('reads how exact a position is from a boolean, its radius from a number and its area from GeoJSON', () => {
    const homes = resource('homes')
      .table('homes')
      .fields({ id: f.integer(), lat: f.decimal({ precision: 8, scale: 6 }).filterable(), lng: f.decimal({ precision: 9, scale: 6 }).filterable(), exact: f.boolean(), accuracy: f.decimal({ precision: 8, scale: 1 }), outline: f.json(), street: f.text() })
      .primaryKey((r) => r.id)
      .toModel()
    const map = { kind: 'map' as const, name: 'map', latitude: 'lat', longitude: 'lng' }
    expect(mapDisplayErrors({ ...map, exact: 'exact', radius: 'accuracy', area: 'outline' }, homes)).toEqual([])
    expect(mapDisplayErrors({ ...map, approximate: 'exact', area: 'street' }, homes)).toEqual([])
    expect(mapDisplayErrors({ ...map, exact: 'street', radius: 'exact', area: 'accuracy' }, homes)).toEqual([
      '"street" on homes is text, not a boolean',
      '"exact" on homes is boolean, not a number of metres',
      '"accuracy" on homes is decimal, not GeoJSON as json or text',
    ])
    expect(mapDisplayErrors({ ...map, approximate: 'near' }, homes)).toEqual(['unknown field "near" on homes'])
  })
})
