import { appPath } from '@protobase/schema'
import type { AlertedListing } from '../emails/alerted-listing'

/** An alert due for mail as the email-alerts job reads it: the listing it found and the search it fits, decimals as text. */
export type AlertRow = {
  listing_id: string | number
  address: string
  place: string
  purchase_price: string | number | null
  rent_price: string | number | null
  living_area: number
  search_id: string | number
  search: string | null
}

const amount = (value: string | number | null) => (value === null ? null : String(value))

/**
 * The listings of a member's alerts, in the order they were found, each once with every search of theirs it fits, and
 * links on the app at `base`.
 */
export const alertedListings = (rows: AlertRow[], base: string): AlertedListing[] => {
  const listings = new Map<string, AlertedListing>()
  for (const row of rows) {
    const search = { name: row.search, url: `${base}${appPath({ kind: 'record', resource: 'saved_searches', key: String(row.search_id) })}` }
    const known = listings.get(String(row.listing_id))
    if (known) {
      known.searches.push(search)
      continue
    }
    listings.set(String(row.listing_id), {
      address: row.address,
      place: row.place,
      purchasePrice: amount(row.purchase_price),
      rentPrice: amount(row.rent_price),
      livingArea: row.living_area,
      url: `${base}${appPath({ kind: 'record', resource: 'listings', key: String(row.listing_id) })}`,
      searches: [search],
    })
  }
  return [...listings.values()]
}
