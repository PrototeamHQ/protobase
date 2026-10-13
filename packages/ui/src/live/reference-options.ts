import type { FacetOption } from '../filter-panel'

/** Records found by a search as options, with the count of each that the facet counts know. */
export const matchOptions = (matches: Array<[string, string]>, counted: FacetOption[]): FacetOption[] => {
  const counts = new Map(counted.map((option) => [option.value, option.count]))
  return matches.map(([value, label]) => ({ value, label, ...(counts.get(value) !== undefined && { count: counts.get(value) }) }))
}

/** The keys a facet still needs names for: the counted values come named, but a chosen one may lie outside them. */
export const labelKeys = (counted: string[], chosen: string[]) => [...new Set(chosen.filter((value) => !counted.includes(value)))]
