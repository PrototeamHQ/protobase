import type { FilterConfig } from './filter-config'
import type { FilterChip } from './filter-state'
import { text } from './messages'

export type MoreItem = { key: string; label: string }

/** The filter a chip belongs to: `facet:<id>`, `range:<id>`, `toggle:<id>` or `date`. A filter is active exactly when it has a chip. */
export const activeFilterKeys = (chips: FilterChip[]): string[] => [...new Set(chips.map((chip) => chip.key.split(':').slice(0, 2).join(':')))]

/** `revealed` itself when it holds every key already, else a copy with the missing keys appended. */
export const mergeKeys = (revealed: string[], keys: string[]): string[] => {
  const missing = keys.filter((key) => !revealed.includes(key))
  return missing.length === 0 ? revealed : [...revealed, ...missing]
}

/** The filter keys the bar draws, and the secondary filters left for the "More filters" menu, in the order the bar draws them. */
export const barFilters = (config: FilterConfig, revealed: string[]) => {
  const all: Array<MoreItem & { secondary?: boolean }> = [
    ...config.facets.map((group) => ({ key: `facet:${group.id}`, label: group.label, secondary: group.secondary })),
    ...(config.ranges ?? []).map((range) => ({ key: `range:${range.id}`, label: range.label, secondary: range.secondary })),
    ...(config.datePresets ? [{ key: 'date', label: text('date'), secondary: config.dateSecondary }] : []),
    ...(config.toggles ?? []).map((toggle) => ({ key: `toggle:${toggle.id}`, label: toggle.label, secondary: toggle.secondary })),
  ]
  const shown = new Set<string>()
  const more: MoreItem[] = []
  for (const filter of all) {
    if (!filter.secondary || revealed.includes(filter.key)) shown.add(filter.key)
    else more.push({ key: filter.key, label: filter.label })
  }
  return { shown, more }
}
