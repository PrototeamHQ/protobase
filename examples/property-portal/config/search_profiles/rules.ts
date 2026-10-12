type Amount = string | number | null | undefined

/** The fields of a search profile its rules read, as a write gives them: the record as it would be stored. */
export type ProfileRecord = {
  for_sale?: boolean | null
  for_rent?: boolean | null
  min_purchase_price?: Amount
  max_purchase_price?: Amount
  min_rent_price?: Amount
  max_rent_price?: Amount
}

const given = (value: Amount): value is string | number => value !== undefined && value !== null && value !== ''

/** What is wrong with a search profile, by field: it looks to buy, to rent or both, and each range ends at or above its start. */
export const profileIssues = (record: ProfileRecord) => {
  const issues: Array<{ field: keyof ProfileRecord; message: string }> = []
  if (!record.for_sale && !record.for_rent) issues.push({ field: 'for_sale', message: 'To buy, to rent or both' })
  if (given(record.min_purchase_price) && given(record.max_purchase_price) && Number(record.max_purchase_price) < Number(record.min_purchase_price)) {
    issues.push({ field: 'max_purchase_price', message: 'At least the minimum purchase price' })
  }
  if (given(record.min_rent_price) && given(record.max_rent_price) && Number(record.max_rent_price) < Number(record.min_rent_price)) {
    issues.push({ field: 'max_rent_price', message: 'At least the minimum rent' })
  }
  return issues.length > 0 ? issues : undefined
}
