import type { FieldType, FilterWidgetModel, ResourceModel, ViewModel } from '@protobase/schema'
import type { FacetGroupConfig, FilterConfig, RangeConfig } from '../filter-panel'
import { formatMoney } from '../format/money'

const numberTypes: FieldType[] = ['integer', 'bigint', 'decimal']

const isNumber = (model: ResourceModel | undefined, field: string) => {
  const type = model?.fields[field]?.type
  return type !== undefined && numberTypes.includes(type)
}

/** A filter on a number field is a range slider, whichever widget the view asked for. */
const rangeOf = (widget: FilterWidgetModel, model: ResourceModel | undefined) =>
  widget.kind === 'range' || (widget.kind === 'facets' && isNumber(model, widget.field))

const emptyRange = (field: string): RangeConfig => ({ id: field, label: field, min: 0, max: 0, step: 1, histogram: [], format: String })

/**
 * The widgets of a view in the shape `filter-string` talks to; options and counts are filled in later. Facets on a
 * reference to another resource's records are a combobox, which searches those records.
 */
export const widgetFields = (view: ViewModel | undefined, model?: ResourceModel): Pick<FilterConfig, 'facets' | 'ranges' | 'dateField' | 'dateKind' | 'datePresets' | 'toggles'> => {
  const widgets = view?.filters ?? []
  const date = widgets.find((widget) => widget.kind === 'dateRange')
  return {
    facets: widgets.flatMap((widget): FacetGroupConfig[] => {
      if (widget.kind === 'facets' && !rangeOf(widget, model)) {
        return [{ id: widget.field, label: widget.field, options: [], searchable: widget.search, ...(model?.fields[widget.field]?.type === 'relation' && { combobox: true }) }]
      }
      if (widget.kind === 'flags') return [{ id: widget.fields.join('|'), label: widget.label, options: widget.fields.map((field) => ({ value: field, label: field, count: 0 })), flags: true }]
      return []
    }),
    ranges: widgets.flatMap((widget) => (widget.kind !== 'flags' && rangeOf(widget, model) ? [emptyRange(widget.field)] : [])),
    ...(date && { dateField: date.field, dateKind: model?.fields[date.field]?.type === 'date' ? ('date' as const) : ('timestamp' as const), ...(date.presets.length > 0 && { datePresets: date.presets }) }),
    toggles: widgets.flatMap((widget) => (widget.kind === 'toggle' ? [{ id: widget.field, label: widget.field }] : [])),
  }
}

/** Whether a range draws its histogram: only a `range` widget that asks for one. */
export const rangeHistogram = (view: ViewModel | undefined, field: string) =>
  (view?.filters ?? []).some((widget) => widget.kind === 'range' && widget.field === field && widget.histogram)

/** How a range's values read, by the view's prefix and suffix: "€450,000" for a euro amount, "85 m²". */
export const rangeFormat = (view: ViewModel | undefined, field: string) => {
  const hints = view?.fields[field]
  const suffix = hints?.suffix ?? ''
  return (value: number) => `${hints?.prefix === '€' ? formatMoney(value * 100).replace('.00', '') : String(value)}${suffix}`
}
