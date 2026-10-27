import type { ResourceModel } from '@protobase/schema'

export { labelFieldOf, recordTitle, recordTitleField } from '@protobase/schema/internal'

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
