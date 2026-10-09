import type { ResourceModel, ViewModel } from '@protobase/schema'
import type { FilterConfig } from '../filter-panel'

/** The widgets of a view in the shape `filter-string` talks to; options and counts are filled in later. */
export const widgetFields = (view: ViewModel | undefined, model?: ResourceModel): Pick<FilterConfig, 'facets' | 'range' | 'dateField' | 'dateKind' | 'datePresets' | 'toggles'> => {
  const widgets = view?.filters ?? []
  const range = widgets.find((widget) => widget.kind === 'range')
  const date = widgets.find((widget) => widget.kind === 'dateRange')
  return {
    facets: widgets.flatMap((widget) => (widget.kind === 'facets' ? [{ id: widget.field, label: widget.field, options: [], searchable: widget.search }] : [])),
    ...(range && { range: { id: range.field, label: range.field, min: 0, max: 0, step: 1, histogram: [], format: String } }),
    ...(date && { dateField: date.field, dateKind: model?.fields[date.field]?.type === 'date' ? ('date' as const) : ('timestamp' as const), ...(date.presets.length > 0 && { datePresets: date.presets }) }),
    toggles: widgets.flatMap((widget) => (widget.kind === 'toggle' ? [{ id: widget.field, label: widget.field }] : [])),
  }
}
