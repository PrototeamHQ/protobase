import { enumLabel, type FieldModel, type ResourceModel, type ViewModel } from '@protobase/schema'

const labelCandidates = ['name', 'title', 'number', 'sku', 'email', 'code', 'description']

// A sensitive field, write-only ones included, is in no list response, so it cannot name a record
const namesRecords = (field: FieldModel | undefined) => field?.type === 'text' && !field.sensitive

/** The field that names a record when another record points at it. */
export const labelFieldOf = (model: ResourceModel, view?: ViewModel) =>
  view?.title ??
  labelCandidates.find((name) => namesRecords(model.fields[name])) ??
  Object.values(model.fields).find(namesRecords)?.name ??
  model.primaryKey[0]!

/** What names a record: the view's `title`, else the first text column of its list, else `labelFieldOf`. */
export const recordTitleField = (model: ResourceModel, view: ViewModel | undefined) =>
  view?.title ?? view?.list?.columns.find((name) => model.fields[name]?.type === 'text') ?? labelFieldOf(model)

/** A record's name as shown: its title field's value, an enum's by its label, else `fallback` when the value is missing. */
export const recordTitle = (model: ResourceModel, view: ViewModel | undefined, record: Record<string, unknown>, fallback: string) => {
  const name = recordTitleField(model, view)
  const value = record[name]
  if (value === null || value === undefined) return fallback
  return model.fields[name]?.type === 'enum' ? enumLabel(String(value), view?.fields[name]?.valueLabels) : String(value)
}

// A key part of a record; a list row holds a relation as `{ id, name }`, so a relation key part is its `id`.
const keyPart = (model: ResourceModel, record: Record<string, unknown>, name: string) => {
  const value = record[name]
  const labelled = model.fields[name]?.type === 'relation' && typeof value === 'object' && value !== null && 'id' in value
  return (labelled ? value.id : value) as string | number
}

export const recordId = (model: ResourceModel, record: Record<string, unknown>) =>
  model.primaryKey.map((name) => String(keyPart(model, record, name))).join(',')

/** The key as the URL carries it, for `get` and `update`, from a stored record or a list row. */
export const recordKey = (model: ResourceModel, record: Record<string, unknown>) => {
  const parts = model.primaryKey.map((name) => keyPart(model, record, name))
  return parts.length === 1 ? parts[0]! : parts
}
