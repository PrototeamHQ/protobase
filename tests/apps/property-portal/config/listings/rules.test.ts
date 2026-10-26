import { describe, expect, it } from 'vitest'
import { listingIssues } from './rules'

// A flat for sale, as a write would store it.
const flat = { purchase_price: '450000.00', rent_price: null, status: 'available', rooms: 3, bedrooms: 2 }

describe('listingIssues', () => {
  it('takes a purchase price, a rent or both', () => {
    expect(listingIssues(flat)).toBeUndefined()
    expect(listingIssues({ ...flat, purchase_price: null, rent_price: '1450.00' })).toBeUndefined()
    expect(listingIssues({ ...flat, rent_price: '1450.00' })).toBeUndefined()
    expect(listingIssues({ ...flat, purchase_price: null })).toEqual([{ field: 'purchase_price', message: 'A purchase price, a rent or both' }])
    expect(listingIssues({ ...flat, purchase_price: '', rent_price: undefined })).toEqual([{ field: 'purchase_price', message: 'A purchase price, a rent or both' }])
  })

  it('is sold only with a purchase price and let only with a rent', () => {
    expect(listingIssues({ ...flat, status: 'sold' })).toBeUndefined()
    expect(listingIssues({ ...flat, status: 'let' })).toEqual([{ field: 'status', message: 'Let needs a rent' }])
    expect(listingIssues({ ...flat, purchase_price: null, rent_price: '1450.00', status: 'sold' })).toEqual([{ field: 'status', message: 'Sold needs a purchase price' }])
    expect(listingIssues({ ...flat, rent_price: '1450.00', status: 'let' })).toBeUndefined()
  })

  it('has fewer bedrooms than rooms', () => {
    expect(listingIssues({ ...flat, bedrooms: 3 })).toEqual([{ field: 'bedrooms', message: 'Fewer bedrooms than rooms: the living room is a room too' }])
    expect(listingIssues({ ...flat, bedrooms: undefined })).toBeUndefined()
  })
})
