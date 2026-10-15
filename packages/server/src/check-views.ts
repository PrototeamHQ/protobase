import type { ActionRun, CardPhotosModel, GalleryModel, ResourceModel, ViewModel } from '@protobase/schema'
import { addressErrors, addressPlaceholders, displayFields, fieldRefsIn, hrefField, hrefPlaceholders, linkActionError } from '@protobase/schema/internal'
import type { Registry } from './registry'
import { cardFavoriteErrors, favoriteOwnerErrors } from './view-card-favorite'
import { cardPhotosErrors } from './view-card-photos'
import { saveSearchErrors, searchesOfErrors } from './view-saved-search'
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
    ['a gallery', view.layout.flatMap((item) => (item.kind === 'gallery' && item.image !== undefined ? [item.image] : []))],
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

// Only text runs over several lines, so a box that grows with it fits no other field.
const multilineErrors = (view: ViewModel, model: ResourceModel) =>
  Object.entries(view.fields).flatMap(([name, hints]) => {
    const field = model.fields[name]
    return hints.multiline && field && field.type !== 'text' ? [`multiline "${name}" needs a text field, not ${field.type}`] : []
  })

// A link goes to an address the app has, or leaves the app; a path in the app is written as an address, and a link
// that is only a field's URL names a field the resource has.
const linkErrors = (view: ViewModel, model: ResourceModel, models: Record<string, ResourceModel>, pages: ReadonlySet<string>) =>
  view.actions.flatMap(({ name, label, run }) => {
    if (run?.kind !== 'link') return []
    const error = linkActionError(label, run)
    if (error) return [`action "${name}": ${error}`]
    const field = 'href' in run ? hrefField(run.href) : undefined
    if (field !== undefined && !Object.hasOwn(model.fields, field)) return [`action "${name}": href names field "${field}", which ${model.name} does not have`]
    return 'to' in run ? addressErrors(run.to, { models, pages, source: model }).map((error) => `action "${name}": ${error}`) : []
  })

// Displays and custom sections name fields of the resource; the builder's types say so, a view written as data is checked here.
const unknownFieldErrors = (view: ViewModel, model: ResourceModel) => {
  const unknown = (names: string[], what: string) => names.filter((name) => !Object.hasOwn(model.fields, name)).map((name) => `${what} names field "${name}", which ${model.name} does not have`)
  return [
    ...(view.list?.displays ?? []).flatMap((display) => unknown(displayFields(display), `display "${display.name}"`)),
    ...view.layout.flatMap((item) => (item.kind === 'custom' ? unknown(fieldRefsIn(item.props), `custom section ${item.component}`) : [])),
    ...view.layout.flatMap((item) => (item.kind === 'gallery' && item.image !== undefined ? unknown([item.image], `gallery "${item.title}"`) : [])),
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

// A list's records load with one set of photos, so its cards displays that show photos all name the same ones.
const sharedPhotosErrors = (view: ViewModel) => {
  const shown = (view.list?.displays ?? []).flatMap((display) => (display.kind === 'cards' && display.photos ? [{ name: display.name, photos: display.photos }] : []))
  const same = (a: CardPhotosModel, b: CardPhotosModel) => a.resource === b.resource && a.field === b.field && a.image === b.image && a.sort === b.sort
  return shown.filter(({ photos }) => !same(photos, shown[0]!.photos)).map(({ name }) => `display "${name}" photos: the list's records load with one set of photos, so name those of display "${shown[0]!.name}"`)
}

// A gallery shows the record's own file field first, then its photos, which load as a card's do.
const galleryErrors = (item: GalleryModel, resource: string, model: ResourceModel, models: Record<string, ResourceModel>) => {
  const image = item.image === undefined ? undefined : model.fields[item.image]
  return [
    ...(image && image.type !== 'file' ? [`"${item.image}" is not a file field`] : []),
    ...(item.photos ? cardPhotosErrors(item.photos, resource, models).map((error) => `photos: ${error}`) : []),
  ]
}

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
 * has a related section, a cards display's or gallery's photos or a cards display's favorite button, a `listOf`, a "Save search" button or a
 * `searchesOf` that do not fit the resources, cards
 * displays of one list that name different photos, a map that cannot show the
 * record's position or a map display that cannot find the records in its view, or a link to an address the app does not have.
 */
export const checkViews = (registry: Registry, views: ViewModel[], pages: readonly string[] = [], fieldTypes: Readonly<Record<string, readonly string[]>> = {}) => {
  const models = Object.fromEntries(registry.entries.map((entry) => [entry.name, entry.model]))
  const pageNames = new Set(pages)
  const problems = views.flatMap((view) => {
    const model = models[view.resource]
    if (!model) return []
    const related = view.layout.flatMap((item) => (item.kind === 'related' ? relatedErrors(item, view.resource, models).map((error) => `related "${item.title}": ${error}`) : []))
    const photos = [
      ...(view.list?.displays ?? []).flatMap((display) =>
        display.kind === 'cards' && display.photos ? cardPhotosErrors(display.photos, view.resource, models).map((error) => `display "${display.name}" photos: ${error}`) : [],
      ),
      ...sharedPhotosErrors(view),
      ...view.layout.flatMap((item) => (item.kind === 'gallery' ? galleryErrors(item, view.resource, model, models).map((error) => `gallery "${item.title}": ${error}`) : [])),
    ]
    const favorites = (view.list?.displays ?? []).flatMap((display) =>
      display.kind === 'cards' && display.favorite
        ? [...cardFavoriteErrors(display.favorite, view.resource, models), ...favoriteOwnerErrors(display.favorite, models)].map((error) => `display "${display.name}" favorite: ${error}`)
        : [],
    )
    const listOf = view.listOf === undefined ? [] : listOfErrors(model, view.listOf, models).map((error) => `listOf: ${error}`)
    const searches = [
      ...(view.saveSearch ? saveSearchErrors(view.saveSearch, view.resource, models, views).map((error) => `saveSearch: ${error}`) : []),
      ...(view.searchesOf ? searchesOfErrors(view.searchesOf, view.resource, models).map((error) => `searchesOf: ${error}`) : []),
    ]
    const maps = [
      ...view.layout.flatMap((item) => (item.kind === 'map' ? mapErrors(item, model).map((error) => `map "${item.title}": ${error}`) : [])),
      ...(view.list?.displays ?? []).flatMap((display) => (display.kind === 'map' ? mapDisplayErrors(display, model).map((error) => `display "${display.name}": ${error}`) : [])),
    ]
    return [...sensitiveErrors(view, model), ...unknownFieldErrors(view, model), ...valueLabelErrors(view, model), ...valueColorErrors(view, model), ...multilineErrors(view, model), ...widgetErrors(view, model, fieldTypes), ...related, ...photos, ...favorites, ...listOf, ...searches, ...maps, ...linkErrors(view, model, models, pageNames)].map((problem) => `View "${view.resource}": ${problem}`)
  })
  if (problems.length > 0) throw new Error(`The views do not match the resources:\n${problems.map((problem) => `  - ${problem}`).join('\n')}`)
}
