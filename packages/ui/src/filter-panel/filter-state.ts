import { datePresetLabels, type FilterConfig, type FilterState } from './filter-config'

export const emptyFilterState: FilterState = { facets: {}, toggles: [] }

export type FilterChip = { key: string; label: string }

export const toggleFacetValue = (state: FilterState, group: string, value: string): FilterState => {
  const current = state.facets[group] ?? []
  const next = current.includes(value) ? current.filter((entry) => entry !== value) : [...current, value]
  return { ...state, facets: { ...state.facets, [group]: next } }
}

export const toggleFlag = (state: FilterState, id: string): FilterState => ({
  ...state,
  toggles: state.toggles.includes(id) ? state.toggles.filter((entry) => entry !== id) : [...state.toggles, id],
})

export const activeChips = (config: FilterConfig, state: FilterState): FilterChip[] => {
  const facetChips = config.facets.flatMap((group) =>
    (state.facets[group.id] ?? []).map((value) => ({
      key: `facet:${group.id}:${value}`,
      label: `${group.label}: ${group.options.find((option) => option.value === value)?.label ?? value}`,
    })),
  )
  const range = config.range
  const rangeChips = range && state.range ? [{ key: 'range', label: `${range.label}: ${range.format(state.range[0])} – ${range.format(state.range[1])}` }] : []
  const dateChips = state.date ? [{ key: 'date', label: datePresetLabels[state.date] ?? state.date }] : []
  const toggleChips = state.toggles.map((id) => ({ key: `toggle:${id}`, label: config.toggles?.find((toggle) => toggle.id === id)?.label ?? id }))
  return [...facetChips, ...rangeChips, ...dateChips, ...toggleChips]
}

export const removeChip = (state: FilterState, key: string): FilterState => {
  if (key === 'range') return { ...state, range: undefined }
  if (key === 'date') return { ...state, date: undefined }
  const [kind, group, value] = key.split(':')
  if (kind === 'toggle') return toggleFlag(state, group!)
  if (kind === 'facet') return toggleFacetValue(state, group!, value!)
  throw new Error(`Unknown filter chip key: ${key}`)
}

export const matchesSearch = (label: string, query: string) => label.toLowerCase().includes(query.trim().toLowerCase())
