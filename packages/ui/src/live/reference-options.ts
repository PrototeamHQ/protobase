import type { FacetOption } from '../filter-panel'

/** Records found by a search as options, with the count of each that the facet counts know. */
export const matchOptions = (matches: Array<[string, string]>, counted: FacetOption[]): FacetOption[] => {
  const counts = new Map(counted.map((option) => [option.value, option.count]))
  return matches.map(([value, label]) => ({ value, label, ...(counts.get(value) !== undefined && { count: counts.get(value) }) }))
}

/** The keys a facet needs names for: the values it counted and those chosen, which may lie outside the counted ones. */
export const labelKeys = (counted: string[], chosen: string[]) => [...new Set([...counted, ...chosen])]
