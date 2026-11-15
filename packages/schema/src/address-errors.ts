import { addressPlaceholders, embeddedFilterFields, filterField, resourceField } from './address-template'
import { checkFilter, checkOrderBy, parseFilter, parseOrderBy } from './filter'
import type { AppAddress, FilterErrorCode, ResourceModel } from './model'

export type AddressCheck = {
  /** The resources; against a caller's restricted models, the check says whether that caller can follow the link. */
  models: Record<string, ResourceModel>
  /** The composed pages; without them a page's name is not checked. */
  pages?: ReadonlySet<string>
  /** The resource of the record the link sits on, whose fields its `{{field}}` placeholders name. */
  source?: ResourceModel
  /** Why a placeholder's path cannot be filled, in place of `source`'s fields, such as a layout's lookup through the records around a link. */
  placeholderError?: (path: string) => string | undefined
  /** The resources whose view opens a create page of the app's own, which reads a create address's values whatever their names. */
  createPages?: ReadonlySet<string>
  /** A list's filter may be one `{{field}}`, the record's text, which whoever draws the link parses and checks against the caller's models, as a row button does. */
  filterFromRecord?: boolean
}

// Errors about names, not values: a placeholder's value is only known when the link is followed.
const nameErrors: readonly FilterErrorCode[] = ['unknown-field', 'not-filterable', 'not-sortable', 'unsupported-traversal', 'invalid-traversal']

// A quoted placeholder stands in for a word and any other for a number, so the filter parses and its names can be checked.
const withSamples = (filter: string) => filter.replace(/(["']?)\{\{\s*[^{}]*?\s*\}\}\1/g, (_, quote: string) => (quote ? `${quote}x${quote}` : '0'))

const filterErrors = (model: ResourceModel, filter: string) => {
  const embedded = embeddedFilterFields(filter)
  if (embedded.length > 0) return embedded.map((name) => `filter: "{{${name}}}" sits inside a longer quoted value; quote it alone, such as title = "{{${name}}}"`)
  const parsed = parseFilter(withSamples(filter))
  if (!parsed.ok) return parsed.errors.map((error) => `filter: ${error.message}`)
  if (!parsed.ast) return []
  const checked = checkFilter(model, parsed.ast)
  return checked.ok ? [] : checked.errors.filter((error) => nameErrors.includes(error.code)).map((error) => `filter: ${error.message}`)
}

const orderErrors = (model: ResourceModel, orderBy: string) => {
  if (addressPlaceholders({ kind: 'list', resource: model.name, orderBy }).length > 0) return []
  const parsed = parseOrderBy(orderBy)
  if (!parsed.ok) return parsed.errors.map((error) => `orderBy: ${error.message}`)
  const checked = checkOrderBy(model, parsed.items)
  return checked.ok ? [] : checked.errors.map((error) => `orderBy: ${error.message}`)
}

/**
 * What is wrong with a link's address against these models: an unknown resource or page, a filter, order or values
 * beside a resource taken from the record (`'{{field}}'`), but with `filterFromRecord` a filter that is one `{{field}}`, a `{{field}}` the record it sits
 * on does not have, a filter or order naming fields the resource does not have, or create values for fields it does not
 * have, unless its view opens a create page, which reads them. Empty when it can be followed.
 */
export const addressErrors = (to: AppAddress, { models, pages, source, placeholderError, createPages, filterFromRecord }: AddressCheck): string[] => {
  const placeholders = addressPlaceholders(to).flatMap((name) => {
    if (placeholderError) {
      const error = placeholderError(name)
      return error === undefined ? [] : [error]
    }
    if (!source) return [`"{{${name}}}" takes a value from the record, but the link sits on none`]
    return Object.hasOwn(source.fields, name) ? [] : [`"{{${name}}}" is not a field of ${source.name}`]
  })
  // A filter the record holds whole is known only when the link is drawn, which checks it then.
  const recordFilter = filterFromRecord === true && filterField(to) !== undefined
  // A resource taken from the record is known only when the link is followed, so the address names none of its fields.
  if (to.kind !== 'page' && resourceField(to) !== undefined) {
    const named = to.kind === 'list' ? (to.filter !== undefined && !recordFilter) || to.orderBy !== undefined : to.kind === 'create' && to.values !== undefined
    if (!named) return placeholders
    const allowed = filterFromRecord ? 'no order or values, and a filter only as one field, such as filter: \'{{filter}}\'' : 'no filter, order or values'
    return [...placeholders, `a link whose resource comes from the record ("${to.resource}") names ${allowed}`]
  }
  switch (to.kind) {
    case 'page':
      return pages && !pages.has(to.page) ? [...placeholders, `unknown page "${to.page}"`] : placeholders
    case 'list':
    case 'record':
    case 'create': {
      const target = Object.hasOwn(models, to.resource) ? models[to.resource] : undefined
      if (!target) return [`unknown resource "${to.resource}"`]
      if (to.kind === 'create' && createPages?.has(to.resource)) return placeholders
      if (to.kind === 'create') return [...placeholders, ...Object.keys(to.values ?? {}).filter((name) => !Object.hasOwn(target.fields, name)).map((name) => `values: unknown field "${name}" on ${to.resource}`)]
      if (to.kind !== 'list') return placeholders
      return [...placeholders, ...(to.filter && !recordFilter ? filterErrors(target, to.filter) : []), ...(to.orderBy ? orderErrors(target, to.orderBy) : [])]
    }
    default:
      return [`an address's kind is list, record, create or page, not "${String((to as { kind: unknown }).kind)}"`]
  }
}
