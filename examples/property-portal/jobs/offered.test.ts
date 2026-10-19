import { describe, expect, it } from 'vitest'
import { listingStatuses } from '../config/listings/data'
import { isOffered } from './offered'

describe('isOffered', () => {
  it('tells of a home available or under offer, not one sold or let', () => {
    expect(listingStatuses.filter(isOffered)).toEqual(['available', 'under_offer'])
  })
})
