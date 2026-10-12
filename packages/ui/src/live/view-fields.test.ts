import { describe, expect, it } from 'vitest'
import { f, resource, view } from '@protobase/schema'
import { rangeHistogram, widgetFields } from './view-fields'

const listings = resource('listings')
  .table('market.listings')
  .fields({
    id: f.integer(),
    place_id: f.relation('places'),
    offer_type: f.enum(['sale', 'rent']),
    price: f.integer(),
    living_area: f.integer(),
    bedrooms: f.integer(),
    garden: f.boolean(),
  })
  .primaryKey((r) => r.id)

const model = listings.toModel()

const filtered = view<typeof listings>('listings')
  .filters((r, w) => [
    w.facets(r.offer_type),
    w.facets(r.place_id, { search: true }),
    w.range(r.price, { histogram: true }),
    w.range(r.living_area),
    w.facets(r.bedrooms),
    w.toggle(r.garden),
  ])
  .toModel(model)

describe('widgetFields', () => {
  it('gives every range widget a slider, not only the first', () => {
    expect(widgetFields(filtered, model).ranges?.map((range) => range.id)).toEqual(['price', 'living_area', 'bedrooms'])
  })

  it('makes facets on a number field a range slider', () => {
    const fields = widgetFields(filtered, model)
    expect(fields.facets.map((group) => group.id)).toEqual(['offer_type', 'place_id'])
    expect(fields.ranges?.find((range) => range.id === 'bedrooms')).toMatchObject({ histogram: [] })
  })

  it('makes facets on a reference a combobox and leaves other facets checkboxes', () => {
    const [offerType, place] = widgetFields(filtered, model).facets
    expect(offerType?.combobox).toBeUndefined()
    expect(place).toMatchObject({ id: 'place_id', combobox: true, searchable: true })
  })

  it('keeps facets on a number field when the model is not known', () => {
    expect(widgetFields(filtered).facets.map((group) => group.id)).toEqual(['offer_type', 'place_id', 'bedrooms'])
  })
})

describe('rangeHistogram', () => {
  it('draws bars only for a range widget that asks for them', () => {
    expect(rangeHistogram(filtered, 'price')).toBe(true)
    expect(rangeHistogram(filtered, 'living_area')).toBe(false)
    expect(rangeHistogram(filtered, 'bedrooms')).toBe(false)
  })
})
