import type { DatePreset } from '@protobase/schema'

/** `count` is left out when it is not known, such as for a record found by a search. */
export type FacetOption = { value: string; label: string; count?: number }

export type FacetGroupConfig = {
  id: string
  label: string
  options: FacetOption[]
  searchable?: boolean
  /** A dropdown that searches as you type and holds several choices, instead of a list of checkboxes. */
  combobox?: boolean
  /** Names of chosen values that are not among `options`, such as those picked from an earlier search. */
  labels?: Record<string, string>
  /** Called as the search text changes, the options then being the matches; without it the options are filtered here. */
  onSearch?: (text: string) => void
  /** The options are boolean fields by name, and a record shows when any chosen one is true. */
  flags?: boolean
}

export type RangeConfig = {
  id: string
  label: string
  min: number
  max: number
  step: number
  /** Bar heights (counts) of the histogram drawn behind the slider. */
  histogram: number[]
  format: (value: number) => string
}

export type DatePresetId = DatePreset

export type ToggleConfig = { id: string; label: string }

export type FilterConfig = {
  facets: FacetGroupConfig[]
  ranges?: RangeConfig[]
  /** `true` shows the default presets; a list shows exactly those. */
  datePresets?: boolean | DatePresetId[]
  /** The field the date presets filter on, for configs that talk to a server. */
  dateField?: string
  /** Whether `dateField` holds dates or timestamps; calendar presets are printed as that literal. */
  dateKind?: 'date' | 'timestamp'
  toggles?: ToggleConfig[]
}

export type FilterState = {
  facets: Record<string, string[]>
  /** The selected span of each range, by its id; a range without one is not filtered on. */
  ranges?: Record<string, [number, number]>
  date?: DatePresetId
  toggles: string[]
}

export const defaultDatePresets: DatePresetId[] = ['today', '7d', '30d', 'year']

export const datePresetLabels: Record<DatePresetId, string> = {
  today: 'Today',
  yesterday: 'Yesterday',
  '24h': 'Last 24 hours',
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
  '90d': 'Last 90 days',
  month: 'This month',
  quarter: 'This quarter',
  year: 'This year',
}
