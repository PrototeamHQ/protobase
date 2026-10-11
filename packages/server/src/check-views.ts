import { addressErrors, addressPlaceholders, appHrefError, displayFields, hrefPlaceholders, type ActionRun, type ResourceModel, type ViewModel } from '@protobase/schema'
import type { Registry } from './registry'
import { relatedErrors } from './view-related'

// The fields a link action takes from the record.
const linkFields = (run: ActionRun | undefined) => (run?.kind !== 'link' ? [] : 'to' in run ? addressPlaceholders(run.to) : hrefPlaceholders(run.href))

// A sensitive value never comes with a record, so only a record page section may name it, where it is revealed.
const sensitiveErrors = (view: ViewModel, model: ResourceModel) => {
  const sensitive = (name: string) => Boolean(model.fields[name]?.sensitive)
  const uses: Array<[string, string[]]> = [
    ['the title', view.title === undefined ? [] : [view.title]],
    ['the search result', [...(view.searchResult?.title ?? []), ...(view.searchResult?.subtitle ? [view.searchResult.subtitle] : [])]],
    ['a list column, sort or search', [...(view.list?.columns ?? []), ...(view.list?.sort ?? []).map(([name]) => name), ...(view.list?.search ?? [])]],
    ['a list display', (view.list?.displays ?? []).flatMap(displayFields)],
    ['a filter', view.filters.map((widget) => widget.field)],
    ['the chart', view.chart ? [view.chart.field] : []],
    ['the sidebar', view.layout.flatMap((item) => (item.kind === 'sidebar' ? item.fields : []))],
    ['the recent records', view.nav?.recent ? [view.nav.recent.status] : []],
    ['an action', view.actions.flatMap((action) => (action.run?.kind === 'update' ? Object.keys(action.run.values) : linkFields(action.run)))],
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

// A link goes to an address the app has, or leaves the app; a path in the app is written as an address.
const linkErrors = (view: ViewModel, model: ResourceModel, models: Record<string, ResourceModel>, pages: ReadonlySet<string>) =>
  view.actions.flatMap(({ name, run }) => {
    if (run?.kind !== 'link') return []
    if ('href' in run) {
      const error = appHrefError(run.href)
      return error ? [`action "${name}": ${error}`] : []
    }
    return addressErrors(run.to, { models, pages, source: model }).map((error) => `action "${name}": ${error}`)
  })

// A display shows fields of the resource; the builder's types say so, a view written as data is checked here.
const displayErrors = (view: ViewModel, model: ResourceModel) =>
  (view.list?.displays ?? []).flatMap((display) => displayFields(display).filter((name) => !Object.hasOwn(model.fields, name)).map((name) => `display "${display.name}" names field "${name}", which ${model.name} does not have`))

/**
 * Fails at startup when a view uses a sensitive field where it would show empty, a display names a field the resource
 * does not have, labels values its enum does not have,
 * has a related section that does not fit the resources, or a link to an address the app does not have.
 */
export const checkViews = (registry: Registry, views: ViewModel[], pages: readonly string[] = []) => {
  const models = Object.fromEntries(registry.entries.map((entry) => [entry.name, entry.model]))
  const pageNames = new Set(pages)
  const problems = views.flatMap((view) => {
    const model = models[view.resource]
    if (!model) return []
    const related = view.layout.flatMap((item) => (item.kind === 'related' ? relatedErrors(item, view.resource, models).map((error) => `related "${item.title}": ${error}`) : []))
    return [...sensitiveErrors(view, model), ...displayErrors(view, model), ...valueLabelErrors(view, model), ...related, ...linkErrors(view, model, models, pageNames)].map((problem) => `View "${view.resource}": ${problem}`)
  })
  if (problems.length > 0) throw new Error(`The views do not match the resources:\n${problems.map((problem) => `  - ${problem}`).join('\n')}`)
}
