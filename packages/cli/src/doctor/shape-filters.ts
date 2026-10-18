import { checkFilter, checkOrderBy, parseFilter, parseOrderBy, type CheckedFilter, type FieldModel, type Literal, type ResourceModel, type SortSpec } from '@protobase/schema'

// Filters as the app builds them, with placeholder values: the index rule reads only fields and operators, and a
// value's kind only to tell a pattern (`name = "*port*"`) from a plain comparison.

const span = { start: 0, end: 0 }
const number: Literal = { kind: 'number', value: 0, raw: '0', span }

type Op = '=' | '>' | '>=' | '<' | '<='

export const compare = (field: FieldModel, op: Op = '='): CheckedFilter => ({ kind: 'compare', op, field, value: number, span })

export const isTrue = (field: FieldModel): CheckedFilter => ({ kind: 'compare', op: '=', field, value: { kind: 'boolean', value: true, span }, span })

export const anyOf = (field: FieldModel): CheckedFilter => ({ kind: 'in', field, values: [number], span })

/** A JSON field is filtered by a key's value (`tags:urgent`), a GIN index's read. */
export const holds = (field: FieldModel): CheckedFilter => ({ kind: 'has', field, value: { kind: 'string', value: '', span }, span })

export const searchFor: CheckedFilter = { kind: 'search', text: '…', span }

export const all = (filters: Array<CheckedFilter | undefined>): CheckedFilter | undefined => {
  const present = filters.filter((filter): filter is CheckedFilter => filter !== undefined)
  return present.length < 2 ? present[0] : { kind: 'and', args: present, span }
}

export const any = (filters: CheckedFilter[]): CheckedFilter => (filters.length === 1 ? filters[0]! : { kind: 'or', args: filters, span })

// The config's own filters and sorts are checked when the server starts; here they are only read, so every field may
// take part, as in an access rule's filter.
const trusted = (model: ResourceModel): ResourceModel => ({
  ...model,
  fields: Object.fromEntries(Object.entries(model.fields).map(([name, field]) => [name, { ...field, filterable: true, sortable: true }])),
})

/** A filter the config writes, such as a related section's, resolved against the resource; undefined when empty. */
export const configFilter = (model: ResourceModel, source: string | undefined): CheckedFilter | undefined => {
  if (!source?.trim()) return undefined
  const parsed = parseFilter(source)
  if (!parsed.ok) throw new Error(`The filter "${source}" of ${model.name} does not parse: ${parsed.errors[0]!.message}`)
  if (!parsed.ast) return undefined
  const checked = checkFilter(trusted(model), parsed.ast)
  if (!checked.ok) throw new Error(`The filter "${source}" does not fit ${model.name}: ${checked.errors[0]!.message}`)
  return checked.filter
}

/** A sort the config writes, such as `published_at desc`, resolved against the resource; undefined when empty. */
export const configSort = (model: ResourceModel, source: string | undefined): SortSpec | undefined => {
  if (!source?.trim()) return undefined
  const parsed = parseOrderBy(source)
  if (!parsed.ok) throw new Error(`The sort "${source}" of ${model.name} does not parse: ${parsed.errors[0]!.message}`)
  const checked = checkOrderBy(trusted(model), parsed.items)
  if (!checked.ok) throw new Error(`The sort "${source}" does not fit ${model.name}: ${checked.errors[0]!.message}`)
  return checked.sort
}

/** A sort as `order_by` writes it: `name asc, id desc`. */
export const sortText = (sort: SortSpec) => sort.map(([field, direction]) => `${field} ${direction}`).join(', ')
