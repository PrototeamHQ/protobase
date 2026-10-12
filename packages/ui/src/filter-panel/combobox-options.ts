import type { FacetGroupConfig } from './filter-config'
import { matchesSearch } from './filter-state'

/** The options a combobox lists for its search text: as given when the group searches itself, else those whose name matches. */
export const comboboxOptions = (group: FacetGroupConfig, query: string) =>
  group.onSearch ? group.options : group.options.filter((option) => matchesSearch(option.label, query))

/** The option the arrow keys move to, wrapping around at either end; -1 when there are none. */
export const moveActive = (active: number, count: number, key: 'ArrowDown' | 'ArrowUp') => {
  if (count === 0) return -1
  if (key === 'ArrowDown') return active < 0 ? 0 : (active + 1) % count
  return active < 0 ? count - 1 : (active - 1 + count) % count
}
