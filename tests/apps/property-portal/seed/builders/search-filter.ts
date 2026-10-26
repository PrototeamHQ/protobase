import { createWhere, printFilter, type FilterExpr } from '@protobase/schema'

const w = createWhere()

/** What a seeded search looks for, as the listings page's filter panel sets it: each part empty when it does not narrow. */
export type SearchCriteria = {
  forSale: boolean
  forRent: boolean
  placeIds: number[]
  propertyType: string | null
  energyLabels: string[]
  purchasePrice: [number, number] | null
  rentPrice: [number, number] | null
  livingArea: [number, number] | null
  bedrooms: [number, number] | null
  garden: boolean
}

// The panel holds a facet's values as text, so a relation's keys print quoted too: `in(place_id, "1", "8")`.
const choice = (field: string, values: Array<string | number>): FilterExpr[] => {
  const texts = values.map(String)
  return texts.length === 0 ? [] : [texts.length === 1 ? w.eq(field, texts[0]!) : w.in(field, texts as never[])]
}
const range = (field: string, span: [number, number] | null): FilterExpr[] => (span ? [w.gte(field, span[0]), w.lte(field, span[1])] : [])

/**
 * The search's filter as the listings page's address holds it once the panel is set so: the flags, the facets in the
 * view's order, then the ranges and the toggles, as the page prints them.
 */
export const searchFilter = (criteria: SearchCriteria) => {
  const offers = [...(criteria.forSale ? [w.eq('for_sale', true)] : []), ...(criteria.forRent ? [w.eq('for_rent', true)] : [])]
  const clauses = [
    ...(offers.length === 0 ? [] : [offers.length === 1 ? offers[0]! : w.or(...offers)]),
    ...choice('place_id', criteria.placeIds),
    ...choice('property_type', criteria.propertyType === null ? [] : [criteria.propertyType]),
    ...choice('energy_label', criteria.energyLabels),
    ...range('purchase_price', criteria.purchasePrice),
    ...range('rent_price', criteria.rentPrice),
    ...range('living_area', criteria.livingArea),
    ...range('bedrooms', criteria.bedrooms),
    ...(criteria.garden ? [w.eq('garden', true)] : []),
  ]
  return clauses.length === 0 ? '' : printFilter(w.and(...clauses))
}
