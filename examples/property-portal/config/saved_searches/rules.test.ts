import { describe, expect, it } from 'vitest'
import { searchIssues } from './rules'

describe('searchIssues', () => {
  it('takes a filter of the listings, or none', () => {
    expect(searchIssues({ filter: 'for_sale = true AND in(place_id, 1, 2) AND purchase_price <= 500000 AND search("gracht")' })).toBeUndefined()
    expect(searchIssues({ filter: '' })).toBeUndefined()
  })

  it('refuses one that does not read, or names what the listings do not have', () => {
    expect(searchIssues({ filter: 'purchase_price <=' })).toEqual([{ field: 'filter', message: expect.stringContaining('Not a filter of the listings') }])
    expect(searchIssues({ filter: 'swimming_pool = true' })).toEqual([{ field: 'filter', message: expect.stringContaining('swimming_pool') }])
  })
})
