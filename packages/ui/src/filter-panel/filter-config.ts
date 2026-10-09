import type { DatePreset } from '@protobase/schema'

export type FacetOption = { value: string; label: string; count: number }

export type FacetGroupConfig = { id: string; label: string; options: FacetOption[]; searchable?: boolean }

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
  range?: RangeConfig
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
  range?: [number, number]
  date?: DatePresetId
  toggles: string[]
}

export const defaultDatePresets: DatePresetId[] = ['7d', '30d', 'year']

export const datePresetLabels: Record<DatePresetId, string> = {
  today: 'Today',
  yesterday: 'Yesterday',
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
  '90d': 'Last 90 days',
  month: 'This month',
  quarter: 'This quarter',
  year: 'This year',
}
