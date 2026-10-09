import { enumLabel, type ResourceModel, type ViewModel } from '@protobase/schema'

const labelCandidates = ['name', 'title', 'number', 'sku', 'email', 'code', 'description']

/** The field that names a record when another record points at it. */
export const labelFieldOf = (model: ResourceModel, view?: ViewModel) =>
  view?.title ??
  labelCandidates.find((name) => model.fields[name]?.type === 'text') ??
  Object.values(model.fields).find((field) => field.type === 'text')?.name ??
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

export const recordId = (model: ResourceModel, record: Record<string, unknown>) =>
  model.primaryKey.map((name) => String(record[name])).join(',')

/** The key as the URL carries it, for `get` and `update`. */
export const recordKey = (model: ResourceModel, record: Record<string, unknown>) => {
  const parts = model.primaryKey.map((name) => record[name] as string | number)
  return parts.length === 1 ? parts[0]! : parts
}
