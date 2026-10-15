import { describe, expect, it } from 'vitest'
import { f, resource, view } from '@protobase/schema'
import { chosenRelations, filterChips, unseenFilter } from './saved-search'

const listings = resource('listings')
  .table('listings')
  .fields({
    id: f.integer(),
    address: f.text(),
    place_id: f.relation('places').filterable(),
    property_type: f.enum(['house', 'apartment']).filterable(),
    purchase_price: f.decimal({ precision: 12, scale: 2 }).optional().filterable(),
    for_sale: f.boolean().filterable(),
    for_rent: f.boolean().filterable(),
    garden: f.boolean().filterable(),
    published_at: f.timestamp().filterable(),
  })
  .primaryKey((r) => r.id)
  .search((r) => [r.address])
const model = listings.toModel()
const listingsView = view<typeof listings>('listings')
  .fields((r) => ({ place_id: r.place_id.label('Place'), property_type: r.property_type.label('Type').valueLabels({ apartment: 'Flat' }), purchase_price: r.purchase_price.prefix('€') }))
  .filters((r, w) => [w.flags([r.for_sale, r.for_rent], { label: 'Offer' }), w.facets(r.place_id), w.facets(r.property_type), w.range(r.purchase_price), w.toggle(r.garden)])
  .toModel(model)

const filter = 'for_sale = true AND in(place_id, 1, 7) AND property_type = "apartment" AND purchase_price >= 300000 AND purchase_price <= 450000 AND garden = true AND search("canal")'

describe('filterChips', () => {
  it('names each part of a saved filter as the list page does, relation values by the names given', () => {
    const chips = filterChips(model, listingsView, filter, { place_id: { '1': 'Amsterdam', '7': 'Haarlem' } })
    expect(chips.map((chip) => chip.label)).toEqual(['Offer: For sale', 'Place: Amsterdam', 'Place: Haarlem', 'Type: Flat', 'Purchase price: €300,000 – €450,000', 'Garden', '"canal"'])
  })

  it('shows a value it has no name for as it is, and a condition no widget holds as written', () => {
    expect(filterChips(model, listingsView, 'place_id = 3 AND address = "Keizersgracht"').map((chip) => chip.label)).toEqual(['Place: 3', 'address = "Keizersgracht"'])
    expect(filterChips(model, listingsView, 'place_id = ')).toEqual([{ key: 'unreadable', label: 'A filter that cannot be read' }])
  })
})

describe('chosenRelations', () => {
  it('collects the relation values a filter chooses, to name them', () => {
    expect(chosenRelations(model, listingsView, filter)).toEqual({ place_id: ['1', '7'] })
    expect(chosenRelations(model, listingsView, 'garden = true')).toEqual({})
  })
})

describe('unseenFilter', () => {
  it('keeps to the records after the search was last seen', () => {
    expect(unseenFilter('garden = true', 'published_at', '2026-10-01T08:00:00.000Z')).toBe('garden = true AND published_at > 2026-10-01T08:00:00.000Z')
    expect(unseenFilter('', 'published_at', '2026-10-01T08:00:00Z')).toBe('published_at > 2026-10-01T08:00:00.000Z')
  })

  it('takes every record of a search never seen', () => {
    expect(unseenFilter('garden = true', 'published_at', null)).toBe('garden = true')
  })
})
