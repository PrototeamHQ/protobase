import { enumLabel } from './enum-label'
import type { FieldModel, ResourceModel, ViewModel } from './model'

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
