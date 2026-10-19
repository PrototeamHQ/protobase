import { checkFilter, parseFilter, type FilterWidgetModel, type ResourceModel, type ViewModel } from '@protobase/schema'
import { isGroupChart } from '@protobase/schema/internal'

const widgetName: Record<FilterWidgetModel['kind'], string> = { facets: 'facets filter', range: 'range filter', dateRange: 'date range filter', toggle: 'toggle', flags: 'flags filter' }

// The API filters, counts and draws a chart only by filterable fields.
const filterableErrors = (model: ResourceModel, names: string[], what: string) =>
  names.flatMap((name) => {
    const field = Object.hasOwn(model.fields, name) ? model.fields[name]! : undefined
    if (!field) return [`${what} names "${name}", which is not a field of ${model.name}`]
    return field.filterable ? [] : [`${what} uses "${name}", which is not filterable, so the API refuses it: mark "${name}" .filterable()`]
  })

const listSortErrors = (model: ResourceModel, view: ViewModel) =>
  (view.list?.sort ?? []).flatMap(([name]) => {
    const field = Object.hasOwn(model.fields, name) ? model.fields[name]! : undefined
    if (!field) return [`the list sorts by "${name}", which is not a field of ${model.name}`]
    return field.sortable ? [] : [`the list sorts by "${name}", which is not sortable, so the API refuses it: mark "${name}" .sortable()`]
  })

// The list's opening filter must parse and name filterable fields and valid values, as the API will check it.
const listFilterErrors = (model: ResourceModel, view: ViewModel) => {
  const source = view.list?.filter
  if (source === undefined) return []
  const parsed = parseFilter(source)
  if (!parsed.ok) return parsed.errors.map((error) => `the list's filter: ${error.message}`)
  if (!parsed.ast) return []
  const checked = checkFilter(model, parsed.ast)
  return checked.ok ? [] : checked.errors.map((error) => `the list's filter: ${error.message}`)
}

// The list's search box searches the resource's search fields, whatever the view names.
const searchErrors = (model: ResourceModel, view: ViewModel) =>
  (view.list?.search ?? [])
    .filter((name) => !(model.search ?? []).includes(name))
    .map((name) => `the list searches "${name}", which ${model.name} does not search: add it to the resource's .search(...)`)

/**
 * What a view asks the API for that its resource does not allow, which the API refuses only once a page asks: a filter
 * widget or the chart on a field that is not `.filterable()`, a list sorted by one that is not `.sortable()`, a list filter that does not parse or check, and a list
 * search on a field the resource does not search. The server's startup checks the rest of a view.
 */
export const viewQueryErrors = (view: ViewModel, model: ResourceModel): string[] => [
  ...view.filters.flatMap((widget) => filterableErrors(model, widget.kind === 'flags' ? widget.fields : [widget.field], `the ${widgetName[widget.kind]}`)),
  ...(view.chart ? filterableErrors(model, [isGroupChart(view.chart) ? view.chart.groupBy : view.chart.field], 'the chart') : []),
  ...listSortErrors(model, view),
  ...listFilterErrors(model, view),
  ...searchErrors(model, view),
]

/** Throws one error listing what every view asks for that its resource does not allow; views of unknown resources are left to the other checks. */
export const checkViewQueries = (models: ResourceModel[], views: ViewModel[]) => {
  const byName = new Map(models.map((model) => [model.name, model]))
  const problems = views.flatMap((view) => {
    const model = byName.get(view.resource)
    return model ? viewQueryErrors(view, model).map((problem) => `View "${view.resource}": ${problem}`) : []
  })
  if (problems.length > 0) throw new Error(`The views ask for what their resources do not allow:\n${problems.map((problem) => `  - ${problem}`).join('\n')}`)
}
