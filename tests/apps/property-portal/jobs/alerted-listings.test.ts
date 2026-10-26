import { describe, expect, it } from 'vitest'
import { alertedListings, type AlertRow } from './alerted-listings'

const base = 'https://portal.example.com'
// Two alerts for one flat from two searches, and one for a house, as the email-alerts job reads them.
const flat: AlertRow = { listing_id: '42', address: 'Spaarne 12', place: 'Haarlem', purchase_price: '450000.00', rent_price: null, living_area: 85, search_id: '3', search: 'Haarlem' }
const house: AlertRow = { ...flat, listing_id: '7', address: 'Dorpsstraat 1' }

describe('alertedListings', () => {
  it('mails each listing once, with every search of the member it fits, in the order found', () => {
    const listings = alertedListings([flat, house, { ...flat, search_id: '5', search: null }], base)
    expect(listings.map((listing) => listing.url)).toEqual([`${base}/listings/42`, `${base}/listings/7`])
    expect(listings[0]!.searches).toEqual([
      { name: 'Haarlem', url: `${base}/saved_searches/3` },
      { name: null, url: `${base}/saved_searches/5` },
    ])
    expect(listings[0]).toMatchObject({ purchasePrice: '450000.00', rentPrice: null, livingArea: 85 })
  })
})
