import { describe, expect, it } from 'vitest'
import { readSearchFilter } from '../config/saved_searches/filter'
import { fitsSearch } from './match'

// A three-room apartment for sale in Haarlem (place 2), as the database row reads: decimals as text, bigints too.
const listing = {
  id: '42', place_id: 2, agency_id: 7, property_type: 'apartment', status: 'available', address: 'Spaarne 12', postal_code: '2011 CH',
  latitude: '52.381200', longitude: '4.637100', purchase_price: '450000.00', rent_price: null, for_sale: true, for_rent: false,
  living_area: 85, price_per_m2: '5294.12', rooms: 3, bedrooms: 2, energy_label: 'b', garden: false, balcony: true, parking: false,
  published_at: new Date('2026-10-12T09:00:00Z'),
}
// The same flat, let in the meantime.
const both = { ...listing, rent_price: '1450.00', for_rent: true }

const fits = (filter: string, record: Record<string, unknown> = listing) => fitsSearch(readSearchFilter(filter), record)

describe('fitsSearch', () => {
  it('fits every listing to a search without a filter', () => {
    expect(fits('')).toBe(true)
  })

  it('takes the filters of the listings page, as its address holds them', () => {
    expect(fits('for_sale = true AND in(place_id, "1", "2") AND property_type = "apartment"')).toBe(true)
    expect(fits('for_sale = true AND in(place_id, "1", "3")')).toBe(false)
    expect(fits('place_id = "2" AND agency_id = 7')).toBe(true)
    expect(fits('purchase_price >= 300000 AND purchase_price <= 450000 AND bedrooms >= 2 AND bedrooms <= 3')).toBe(true)
    expect(fits('purchase_price >= 300000 AND purchase_price <= 449999')).toBe(false)
    expect(fits('in(energy_label, "a", "b") AND balcony = true')).toBe(true)
    expect(fits('garden = true')).toBe(false)
  })

  it('fits a listing offered both ways to a search for either', () => {
    expect(fits('for_rent = true', both)).toBe(true)
    expect(fits('for_rent = true')).toBe(false)
    expect(fits('(for_sale = true OR for_rent = true) AND rent_price <= 1500', both)).toBe(true)
    // Without a rent the rent range keeps it out, as the list does
    expect(fits('rent_price >= 0 AND rent_price <= 1500')).toBe(false)
  })

  it('looks for the search text in the address and postal code', () => {
    expect(fits('search("spaarne")')).toBe(true)
    expect(fits('spaarne AND for_sale = true')).toBe(true)
    expect(fits('search("2011")')).toBe(true)
    expect(fits('search("gracht")')).toBe(false)
  })

  it('fits nothing to a filter that cannot be read', () => {
    expect(fits('purchase_price <=')).toBe(false)
    expect(fits('swimming_pool = true')).toBe(false)
  })
})
