import type { DatePreset, FilterWidgetModel } from './model'
import type { Ref } from './refs'

/** Every widget also takes `secondary: true`, which puts it behind the bar's "More filters" menu until it is picked there or set. */
export const widgets = {
  /** A slider between the field's lowest and highest value; `histogram` draws the values' histogram behind it. */
  range: (ref: Ref, o: { histogram?: boolean; secondary?: boolean } = {}): FilterWidgetModel => ({
    kind: 'range',
    field: ref.name,
    histogram: o.histogram ?? false,
    ...(o.secondary && { secondary: true }),
  }),
  /**
   * A menu of the field's values with counts; `search` adds a search box for long lists. On a relation it searches the
   * referenced records as you type, on a number field it is a range slider.
   */
  facets: (ref: Ref, o: { search?: boolean; secondary?: boolean } = {}): FilterWidgetModel => ({
    kind: 'facets',
    field: ref.name,
    search: o.search ?? false,
    ...(o.secondary && { secondary: true }),
  }),
  /** A date range with buttons for the `presets`, such as `today` and `30d`. */
  dateRange: (ref: Ref, o: { presets?: DatePreset[]; secondary?: boolean } = {}): FilterWidgetModel => ({
    kind: 'dateRange',
    field: ref.name,
    presets: o.presets ?? [],
    ...(o.secondary && { secondary: true }),
  }),
  /** A switch for a boolean field. */
  toggle: (ref: Ref, o: { secondary?: boolean } = {}): FilterWidgetModel => ({ kind: 'toggle', field: ref.name, ...(o.secondary && { secondary: true }) }),
  /**
   * A menu of boolean fields under one `label`, such as "for sale" and "for rent": a record shows when any chosen field
   * is true, so one that is both shows under each.
   */
  flags: (refs: Ref<string, boolean | null>[], o: { label: string; secondary?: boolean }): FilterWidgetModel => ({
    kind: 'flags',
    fields: refs.map((ref) => ref.name),
    label: o.label,
    ...(o.secondary && { secondary: true }),
  }),
}
