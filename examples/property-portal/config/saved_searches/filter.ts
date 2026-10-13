import { checkFilter, parseFilter, type CheckedFilter } from '@protobase/schema'
import { listings } from '../listings/data'

/** The listings' model, which a saved search's filter is read against and matched by. */
export const listingsModel = listings.toModel()

/** A saved search's filter, read and checked against the listings: `filter` empty when it takes every listing. */
export type SearchFilter = { ok: true; filter: CheckedFilter | undefined } | { ok: false; problems: string[] }

/**
 * Reads a saved search's filter as the listings page's address holds it, such as
 * `for_sale = true AND place_id = 1 AND purchase_price <= 500000`, the way the API's list reads it.
 */
export const readSearchFilter = (text: string): SearchFilter => {
  const parsed = parseFilter(text)
  if (!parsed.ok) return { ok: false, problems: parsed.errors.map((error) => error.message) }
  if (!parsed.ast) return { ok: true, filter: undefined }
  const checked = checkFilter(listingsModel, parsed.ast)
  return checked.ok ? { ok: true, filter: checked.filter } : { ok: false, problems: checked.errors.map((error) => error.message) }
}
