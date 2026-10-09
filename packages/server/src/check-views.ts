import type { ResourceModel, ViewModel } from '@protobase/schema'
import type { Registry } from './registry'
import { relatedErrors } from './view-related'

// A sensitive value never comes with a record, so only a record page section may name it, where it is revealed.
const sensitiveErrors = (view: ViewModel, model: ResourceModel) => {
  const sensitive = (name: string) => Boolean(model.fields[name]?.sensitive)
  const uses: Array<[string, string[]]> = [
    ['the title', view.title === undefined ? [] : [view.title]],
    ['the search result', [...(view.searchResult?.title ?? []), ...(view.searchResult?.subtitle ? [view.searchResult.subtitle] : [])]],
    ['a list column, sort or search', [...(view.list?.columns ?? []), ...(view.list?.sort ?? []).map(([name]) => name), ...(view.list?.search ?? [])]],
    ['a filter', view.filters.map((widget) => widget.field)],
    ['the chart', view.chart ? [view.chart.field] : []],
    ['the sidebar', view.layout.flatMap((item) => (item.kind === 'sidebar' ? item.fields : []))],
    ['the recent records', view.nav?.recent ? [view.nav.recent.status] : []],
    ['an action', view.actions.flatMap((action) => (action.run?.kind === 'update' ? Object.keys(action.run.values) : action.run?.kind === 'link' ? [...action.run.href.matchAll(/\{(\w+)\}/g)].map((match) => match[1]!) : []))],
  ]
  return uses.flatMap(([place, names]) => [...new Set(names.filter(sensitive))].map((name) => `sensitive field "${name}" cannot be in ${place}`))
}

// Value labels belong to an enum and name only its values, so a renamed value cannot leave a label behind.
const valueLabelErrors = (view: ViewModel, model: ResourceModel) =>
  Object.entries(view.fields).flatMap(([name, hints]) => {
    if (!hints.valueLabels) return []
    const field = model.fields[name]
    if (field?.type !== 'enum') return [`value labels of "${name}" need an enum field`]
    return Object.keys(hints.valueLabels).filter((value) => !field.enumValues?.includes(value)).map((value) => `value label "${value}" is not a value of "${name}"`)
  })

/**
 * Fails at startup when a view uses a sensitive field where it would show empty, labels values its enum does not have,
 * or has a related section that does not fit the resources.
 */
export const checkViews = (registry: Registry, views: ViewModel[]) => {
  const models = Object.fromEntries(registry.entries.map((entry) => [entry.name, entry.model]))
  const problems = views.flatMap((view) => {
    const model = models[view.resource]
    if (!model) return []
    const related = view.layout.flatMap((item) => (item.kind === 'related' ? relatedErrors(item, view.resource, models).map((error) => `related "${item.title}": ${error}`) : []))
    return [...sensitiveErrors(view, model), ...valueLabelErrors(view, model), ...related].map((problem) => `View "${view.resource}": ${problem}`)
  })
  if (problems.length > 0) throw new Error(`The views do not match the resources:\n${problems.map((problem) => `  - ${problem}`).join('\n')}`)
}
