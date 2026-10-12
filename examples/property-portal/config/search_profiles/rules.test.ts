import { describe, expect, it } from 'vitest'
import { profileIssues } from './rules'

const buying = { for_sale: true, for_rent: false, min_purchase_price: null, max_purchase_price: '450000.00', min_rent_price: null, max_rent_price: null }

describe('profileIssues', () => {
  it('looks to buy, to rent or both', () => {
    expect(profileIssues(buying)).toBeUndefined()
    expect(profileIssues({ ...buying, for_sale: false, for_rent: true })).toBeUndefined()
    expect(profileIssues({ ...buying, for_rent: true })).toBeUndefined()
    expect(profileIssues({ ...buying, for_sale: false })).toEqual([{ field: 'for_sale', message: 'To buy, to rent or both' }])
  })

  it('ends each price range at or above its start, an open end or start being fine', () => {
    expect(profileIssues({ ...buying, min_purchase_price: '450000.00' })).toBeUndefined()
    expect(profileIssues({ ...buying, min_purchase_price: '450000.01' })).toEqual([{ field: 'max_purchase_price', message: 'At least the minimum purchase price' }])
    expect(profileIssues({ ...buying, min_rent_price: 2000, max_rent_price: 1500 })).toEqual([{ field: 'max_rent_price', message: 'At least the minimum rent' }])
    expect(profileIssues({ ...buying, min_rent_price: 2000, max_rent_price: '' })).toBeUndefined()
  })
})
