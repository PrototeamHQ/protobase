import { createWhere, encodeKey, enumLabel, matchedSearchField, printFilter, type ResourceModel, type ViewModel } from '@protobase/schema'
import type { SearchResultGroup } from '../../app-shell'
import type { MetaData } from '../../data/meta-data'
import { recordKey, recordTitleField } from '../../live/model-helpers'
import { humanize } from '../../live/naming'

const where = createWhere()

/** A resource the global search looks in: one with search fields, in the sidebar or the user menu, that the user can read. */
export type SearchTarget = { model: ResourceModel; view: ViewModel | undefined; label: string }

export type SearchHit = SearchResultGroup['hits'][number]

/** Searching starts at this many characters; fewer match too much to be useful. */
export const minimumQuery = 2

/** Results per resource. */
export const hitsPerResource = 5

export const searchTargets = (meta: MetaData): SearchTarget[] =>
  Object.values(meta.resources).flatMap((model) => {
    const view = meta.views[model.name]
    if (!model.search?.length || !view || view.nav?.hidden || meta.permissions[model.name]?.read === false) return []
    return [{ model, view, label: view.names?.plural ?? humanize(model.name) }]
  })

/** "Search organizations and services", or "Search organizations, services and more" when it looks in more. */
export const searchPlaceholder = (targets: SearchTarget[]) => {
  const names = targets.map((target) => target.label.toLowerCase())
  if (names.length === 0) return 'Search'
  if (names.length === 1) return `Search ${names[0]}`
  if (names.length === 2) return `Search ${names[0]} and ${names[1]}`
  return `Search ${names[0]}, ${names[1]} and more`
}

/** The list filter for the text: the server's partial-word `search(...)` over the resource's search fields. */
export const searchFilter = (text: string) => printFilter(where.search(text.trim()))

/** The fields a result's bold line joins: the view's `searchResult.title`, else the record's title field. */
export const titleFields = (target: SearchTarget) => {
  const fields = target.view?.searchResult?.title
  return fields?.length ? fields : [recordTitleField(target.model, target.view)]
}

/** The second line's field, unless the search matched another: the view's `searchResult.subtitle`, else the first search field not in the title. */
export const subtitleField = (target: SearchTarget) => {
  const title = titleFields(target)
  return target.view?.searchResult?.subtitle ?? target.model.search?.find((name) => !title.includes(name))
}

/** The fields a result needs: the key, the title, the subtitle and the search fields, which say what the text matched. */
export const searchFields = (target: SearchTarget) => {
  const subtitle = subtitleField(target)
  const lineFields = [...titleFields(target), ...(subtitle ? [subtitle] : []), ...(target.model.search ?? [])]
  return [...new Set([...target.model.primaryKey, ...lineFields.filter((name) => Object.hasOwn(target.model.fields, name))])]
}

/** A field of the row as a result line shows it: an enum by its label. */
const shown = (target: SearchTarget, row: Record<string, unknown>, name: string) => {
  const value = row[name]
  if (value === null || value === undefined) return ''
  return target.model.fields[name]?.type === 'enum' ? enumLabel(String(value), target.view?.fields[name]?.valueLabels) : String(value)
}

/**
 * A row as a result for `text`: its title fields joined by spaces (the key when they are empty) over a subtitle, which is
 * the search field explaining the match when neither the title nor the default subtitle does (a phone number searched
 * for), else the default subtitle. `basePath` is where the app is served, so the link opens it in a new tab too.
 */
export const toHit = (target: SearchTarget, row: Record<string, unknown>, text: string, basePath = ''): SearchHit => {
  const key = encodeKey(recordKey(target.model, row))
  const title = titleFields(target)
  const fallback = subtitleField(target)
  const field = matchedSearchField(target.model, row, text, [...title, ...(fallback ? [fallback] : [])]) ?? fallback
  const subtitle = field ? shown(target, row, field) : ''
  return {
    id: key,
    title: title.map((name) => shown(target, row, name)).filter(Boolean).join(' ') || key,
    ...(subtitle && { subtitle }),
    href: `${basePath}/${target.model.name}/${encodeURIComponent(key)}`,
  }
}
