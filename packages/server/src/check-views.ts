import type { ActionRun, ResourceModel, ViewModel } from '@protobase/schema'
import { addressErrors, addressPlaceholders, appHrefError, displayFields, fieldRefsIn, hrefPlaceholders } from '@protobase/schema/internal'
import type { Registry } from './registry'
import { cardFavoriteErrors, favoriteOwnerErrors } from './view-card-favorite'
import { cardPhotosErrors } from './view-card-photos'
import { mapDisplayErrors, mapErrors } from './view-map'
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
    ['a filter', view.filters.flatMap((widget) => (widget.kind === 'flags' ? widget.fields : [widget.field]))],
    ['the chart', view.chart ? [view.chart.field] : []],
    ['the sidebar', view.layout.flatMap((item) => (item.kind === 'sidebar' ? item.fields : []))],
    ['a map', view.layout.flatMap((item) => (item.kind === 'map' ? [item.latitude, item.longitude] : []))],
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

// Value colours fill an enum's badges and name only its values, as value labels do.
const valueColorErrors = (view: ViewModel, model: ResourceModel) =>
  Object.entries(view.fields).flatMap(([name, hints]) => {
    if (!hints.valueColors) return []
    const field = model.fields[name]
    if (field?.type !== 'enum') return [`value colours of "${name}" need an enum field`]
    return Object.keys(hints.valueColors).filter((value) => !field.enumValues?.includes(value)).map((value) => `value colour "${value}" is not a value of "${name}"`)
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

// Displays and custom sections name fields of the resource; the builder's types say so, a view written as data is checked here.
const unknownFieldErrors = (view: ViewModel, model: ResourceModel) => {
  const unknown = (names: string[], what: string) => names.filter((name) => !Object.hasOwn(model.fields, name)).map((name) => `${what} names field "${name}", which ${model.name} does not have`)
  return [
    ...(view.list?.displays ?? []).flatMap((display) => unknown(displayFields(display), `display "${display.name}"`)),
    ...view.layout.flatMap((item) => (item.kind === 'custom' ? unknown(fieldRefsIn(item.props), `custom section ${item.component}`) : [])),
  ]
}

// A field type shows the storage types it names; one the app's plugins do not register is not known here.
const widgetErrors = (view: ViewModel, model: ResourceModel, fieldTypes: Readonly<Record<string, readonly string[]>>) =>
  Object.entries(view.fields).flatMap(([name, hints]) => {
    const of = hints.widget && fieldTypes[hints.widget.name]
    const field = model.fields[name]
    if (!of || !field || of.includes(field.type)) return []
    return [`field "${name}" is ${field.type}, and its field type "${hints.widget!.name}" shows only ${of.join(', ')}`]
  })

// The list of the records a relation points at asks for them by their key, so it must be a single column.
const listOfErrors = (model: ResourceModel, name: string, models: Record<string, ResourceModel>) => {
  const target = models[model.fields[name]?.relation?.resource ?? '']
  if (!target) return [`"${name}" points at no resource of the app`]
  return target.primaryKey.length === 1 ? [] : [`${target.name} has a composite key, so its records cannot be listed by key`]
}

/**
 * Fails at startup when a view uses a sensitive field where it would show empty, a display or custom section names a
 * field the resource does not have, labels or colours values its enum does not have, shows a field with a field type of
 * `fieldTypes` (each with the storage types it shows) that does not show it,
 * has a related section, a cards display's photos or favorite button or a `listOf` that do not fit the resources, a map that cannot show the
 * record's position or a map display that cannot find the records in its view, or a link to an address the app does not have.
 */
export const checkViews = (registry: Registry, views: ViewModel[], pages: readonly string[] = [], fieldTypes: Readonly<Record<string, readonly string[]>> = {}) => {
  const models = Object.fromEntries(registry.entries.map((entry) => [entry.name, entry.model]))
  const pageNames = new Set(pages)
  const problems = views.flatMap((view) => {
    const model = models[view.resource]
    if (!model) return []
    const related = view.layout.flatMap((item) => (item.kind === 'related' ? relatedErrors(item, view.resource, models).map((error) => `related "${item.title}": ${error}`) : []))
    const photos = (view.list?.displays ?? []).flatMap((display) =>
      display.kind === 'cards' && display.photos ? cardPhotosErrors(display.photos, view.resource, models).map((error) => `display "${display.name}" photos: ${error}`) : [],
    )
    const favorites = (view.list?.displays ?? []).flatMap((display) =>
      display.kind === 'cards' && display.favorite
        ? [...cardFavoriteErrors(display.favorite, view.resource, models), ...favoriteOwnerErrors(display.favorite, models)].map((error) => `display "${display.name}" favorite: ${error}`)
        : [],
    )
    const listOf = view.listOf === undefined ? [] : listOfErrors(model, view.listOf, models).map((error) => `listOf: ${error}`)
    const maps = [
      ...view.layout.flatMap((item) => (item.kind === 'map' ? mapErrors(item, model).map((error) => `map "${item.title}": ${error}`) : [])),
      ...(view.list?.displays ?? []).flatMap((display) => (display.kind === 'map' ? mapDisplayErrors(display, model).map((error) => `display "${display.name}": ${error}`) : [])),
    ]
    return [...sensitiveErrors(view, model), ...unknownFieldErrors(view, model), ...valueLabelErrors(view, model), ...valueColorErrors(view, model), ...widgetErrors(view, model, fieldTypes), ...related, ...photos, ...favorites, ...listOf, ...maps, ...linkErrors(view, model, models, pageNames)].map((problem) => `View "${view.resource}": ${problem}`)
  })
  if (problems.length > 0) throw new Error(`The views do not match the resources:\n${problems.map((problem) => `  - ${problem}`).join('\n')}`)
}
