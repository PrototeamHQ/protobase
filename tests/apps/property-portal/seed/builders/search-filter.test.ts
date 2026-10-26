import { describe, expect, it } from 'vitest'
import { readSearchFilter } from '../../config/saved_searches/filter'
import { searchFilter, type SearchCriteria } from './search-filter'

const anything: SearchCriteria = { forSale: false, forRent: false, placeIds: [], propertyType: null, energyLabels: [], purchasePrice: null, rentPrice: null, livingArea: null, bedrooms: null, garden: false }

describe('searchFilter', () => {
  it('prints the criteria as the listings page prints its panel, a filter of the listings', () => {
    const filter = searchFilter({ ...anything, forSale: true, forRent: true, placeIds: [1, 8], propertyType: 'house', purchasePrice: [300_000, 950_000], bedrooms: [3, 6], garden: true })
    expect(filter).toBe('(for_sale = true OR for_rent = true) AND in(place_id, "1", "8") AND property_type = "house" AND purchase_price >= 300000 AND purchase_price <= 950000 AND bedrooms >= 3 AND bedrooms <= 6 AND garden = true')
    expect(readSearchFilter(filter).ok).toBe(true)
  })

  it('is empty for a search of every listing', () => {
    expect(searchFilter(anything)).toBe('')
  })
})
