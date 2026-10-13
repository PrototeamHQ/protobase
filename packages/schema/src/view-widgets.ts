import type { DatePreset, FilterWidgetModel } from './model'
import type { Ref } from './refs'

export const widgets = {
  /** A slider between the field's lowest and highest value; `histogram` draws the values' histogram behind it. */
  range: (ref: Ref, o: { histogram?: boolean } = {}): FilterWidgetModel => ({
    kind: 'range',
    field: ref.name,
    histogram: o.histogram ?? false,
  }),
  /**
   * A menu of the field's values with counts; `search` adds a search box for long lists. On a relation it searches the
   * referenced records as you type, on a number field it is a range slider.
   */
  facets: (ref: Ref, o: { search?: boolean } = {}): FilterWidgetModel => ({
    kind: 'facets',
    field: ref.name,
    search: o.search ?? false,
  }),
  /** A date range with buttons for the `presets`, such as `today` and `30d`. */
  dateRange: (ref: Ref, o: { presets?: DatePreset[] } = {}): FilterWidgetModel => ({
    kind: 'dateRange',
    field: ref.name,
    presets: o.presets ?? [],
  }),
  /** A switch for a boolean field. */
  toggle: (ref: Ref): FilterWidgetModel => ({ kind: 'toggle', field: ref.name }),
  /**
   * A menu of boolean fields under one `label`, such as "for sale" and "for rent": a record shows when any chosen field
   * is true, so one that is both shows under each.
   */
  flags: (refs: Ref<string, boolean | null>[], o: { label: string }): FilterWidgetModel => ({
    kind: 'flags',
    fields: refs.map((ref) => ref.name),
    label: o.label,
  }),
}
