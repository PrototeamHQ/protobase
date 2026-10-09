import type { DatePreset, FilterWidgetModel } from './model'
import type { Ref } from './refs'

export const widgets = {
  range: (ref: Ref, o: { histogram?: boolean } = {}): FilterWidgetModel => ({
    kind: 'range',
    field: ref.name,
    histogram: o.histogram ?? false,
  }),
  facets: (ref: Ref, o: { search?: boolean } = {}): FilterWidgetModel => ({
    kind: 'facets',
    field: ref.name,
    search: o.search ?? false,
  }),
  dateRange: (ref: Ref, o: { presets?: DatePreset[] } = {}): FilterWidgetModel => ({
    kind: 'dateRange',
    field: ref.name,
    presets: o.presets ?? [],
  }),
  toggle: (ref: Ref): FilterWidgetModel => ({ kind: 'toggle', field: ref.name }),
}
