import type { AnyField } from '../field'
import type { FieldModel, ResourceModel } from '../model'
import type { FieldsInput } from '../refs'

// A relation's value is the other record's key and a file's a stored file of the linked record, which a lookup does
// not read for it yet.
const unsupportedTypes = ['relation', 'file']

// The parts of a resource that read and write a column of its own table, which a lookup field does not have.
const roles = (model: ResourceModel): Array<[string, readonly (string | undefined)[]]> => [
  ['the key', model.primaryKey],
  ['the tenant', [model.tenant]],
  ['the owner', [model.owner]],
  ['the author', [model.author]],
  ['the soft delete field', [model.softDelete]],
  ['the position', [model.position?.field, model.position?.within]],
  ['a parent', (model.parents ?? []).map((parent) => parent.field)],
  ['a link', model.links ?? []],
  ['an openExisting key', model.openExisting ?? []],
  ['the ETag field', [model.etagFrom]],
  ['searched', model.search ?? []],
]

// This resource's own relation is known now; another resource's, with `from`, once every resource is.
const viaProblems = (model: ResourceModel, field: FieldModel) => {
  const { via, from } = field.lookup!
  if (from !== undefined) return []
  const relation = Object.hasOwn(model.fields, via) ? model.fields[via]! : undefined
  if (!relation?.relation) return [`goes through "${via}", which is not a relation of ${model.name}`]
  return relation.relation.columns.length === 1 ? [] : [`goes through "${via}", a relation of several columns (not implemented)`]
}

const fieldProblems = (model: ResourceModel, field: FieldModel, meta: AnyField['meta']) => [
  ...(meta.column !== undefined ? ['cannot have a column(), as it has no column of its own'] : []),
  ...(field.default ? ['cannot have a default'] : []),
  ...(field.sensitive ? ['cannot be sensitive'] : []),
  ...(field.ai ? ['cannot be an AI field'] : []),
  ...(field.rollup || field.formula !== undefined ? ['cannot be a rollup or a formula too'] : []),
  ...(unsupportedTypes.includes(field.type) ? [`is ${field.type}, which a lookup cannot show (not implemented)`] : []),
  ...(field.lookup!.field === '' ? ['names no field'] : []),
  ...roles(model).filter(([, names]) => names.includes(field.name)).map(([role]) => `cannot be ${role}, as it has no column of its own`),
  ...viaProblems(model, field),
]

/** What is wrong with a resource's lookup fields, as far as the resource alone tells. */
export const lookupProblems = (model: ResourceModel, fields: FieldsInput) =>
  Object.values(model.lookups ?? {}).flatMap((field) =>
    fieldProblems(model, field, fields[field.name]!.meta).map((problem) => `lookup field "${field.name}" ${problem}`))
