/** The fields of a listing its rules read, as a write gives them: the record as it would be stored. */
export type ListingRecord = {
  purchase_price?: string | number | null
  rent_price?: string | number | null
  status?: string | null
  rooms?: string | number | null
  bedrooms?: string | number | null
}

const missing = (value: unknown) => value === undefined || value === null || value === ''

/**
 * What is wrong with a listing, by field, before Postgres refuses it: it needs a price to buy or to rent it for, can be
 * sold only with a purchase price and let only with a rent, and has fewer bedrooms than rooms.
 */
export const listingIssues = (record: ListingRecord) => {
  const issues: Array<{ field: keyof ListingRecord; message: string }> = []
  if (missing(record.purchase_price) && missing(record.rent_price)) issues.push({ field: 'purchase_price', message: 'A purchase price, a rent or both' })
  if (record.status === 'sold' && missing(record.purchase_price)) issues.push({ field: 'status', message: 'Sold needs a purchase price' })
  if (record.status === 'let' && missing(record.rent_price)) issues.push({ field: 'status', message: 'Let needs a rent' })
  if (!missing(record.bedrooms) && !missing(record.rooms) && Number(record.bedrooms) >= Number(record.rooms)) {
    issues.push({ field: 'bedrooms', message: 'Fewer bedrooms than rooms: the living room is a room too' })
  }
  return issues.length > 0 ? issues : undefined
}
