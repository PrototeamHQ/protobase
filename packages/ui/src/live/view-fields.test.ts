import { describe, expect, it } from 'vitest'
import { f, resource, view } from '@protobase/schema'
import { rangeFormat, rangeHistogram, widgetFields } from './view-fields'

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
    for_sale: f.boolean(),
    for_rent: f.boolean(),
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

describe('flags', () => {
  it('makes a flags widget a facet group of its fields, in their order', () => {
    const offered = view<typeof listings>('listings').filters((r, w) => [w.flags([r.for_sale, r.for_rent], { label: 'Offer' }), w.toggle(r.garden)]).toModel(model)
    const fields = widgetFields(offered, model)
    expect(fields.facets).toEqual([
      { id: 'for_sale|for_rent', label: 'Offer', flags: true, options: [{ value: 'for_sale', label: 'for_sale', count: 0 }, { value: 'for_rent', label: 'for_rent', count: 0 }] },
    ])
    expect(fields.toggles).toEqual([{ id: 'garden', label: 'garden' }])
  })
})

describe('widgetFields secondary', () => {
  const secondary = view<typeof listings>('listings')
    .filters((r, w) => [
      w.facets(r.offer_type, { secondary: true }),
      w.facets(r.place_id),
      w.facets(r.bedrooms, { secondary: true }),
      w.range(r.price),
      w.toggle(r.garden, { secondary: true }),
      w.flags([r.for_sale, r.for_rent], { label: 'Offer', secondary: true }),
      w.dateRange(r.id, { secondary: true }),
    ])
    .toModel(model)

  it('marks the secondary widgets of every kind and only those', () => {
    const fields = widgetFields(secondary, model)
    expect(fields.facets.map((group) => group.secondary)).toEqual([true, undefined, true])
    expect(fields.ranges?.map((range) => range.secondary)).toEqual([true, undefined])
    expect(fields.toggles?.map((toggle) => toggle.secondary)).toEqual([true])
    expect(fields.dateSecondary).toBe(true)
    expect('secondary' in fields.facets[1]!).toBe(false)
  })
})

describe('rangeFormat', () => {
  it("reads a range as money in the view's currency, else with its prefix and suffix", () => {
    const hinted = view<typeof listings>('listings').fields((r) => ({ price: r.price.currency('EUR'), living_area: r.living_area.prefix('±').suffix(' m²') })).toModel()
    expect(rangeFormat(hinted, 'price')(450000)).toBe('€450,000')
    expect(rangeFormat(hinted, 'living_area')(85)).toBe('±85 m²')
    expect(rangeFormat(view<typeof listings>('listings').fields((r) => ({ price: r.price.prefix('€') })).toModel(), 'price')(450000)).toBe('€450000')
  })
})
