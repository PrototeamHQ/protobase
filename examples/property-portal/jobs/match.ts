import { evaluateFilter } from '@protobase/schema'
import { listingsModel, type SearchFilter } from '../config/saved_searches/filter'

/** A listing as matching reads it: its fields by name, as the database row holds them. */
export type ListingRecord = Record<string, unknown>

/**
 * Whether a listing fits a saved search: the search's filter holds for it, read as the listings page's list reads it,
 * its search text in the listings' search fields too. A filter that cannot be read fits nothing; an empty one fits
 * every listing.
 */
export const fitsSearch = (search: SearchFilter, listing: ListingRecord, now = new Date()) => {
  if (!search.ok) return false
  return search.filter === undefined || evaluateFilter(search.filter, listing, { search: listingsModel, now: () => now }) === true
}
