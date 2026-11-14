import type { ResourceModel } from '@protobase/schema'
import { recordKey } from '../../live/model-helpers'
import { viewedFile, type SiblingFile, type ViewedFile } from './file-viewer'

// The relation fields a list can filter by, which the record points at a record with; the tenant is the same anyway.
const sharedRelations = (model: ResourceModel, record: Record<string, unknown>) =>
  Object.values(model.fields).filter((field) => field.type === 'relation' && field.filterable && field.name !== model.tenant && record[field.name] != null)

// A relation's value as a list row holds it, `{ id, name }` when labelled, or as it is.
const relationValue = (value: unknown) => (typeof value === 'object' && value !== null && 'id' in value ? (value as { id: unknown }).id : value)

/**
 * The filter for the records of `model` that point at every record `record` points at, through the relations a list can
 * filter by; `undefined` when it points at none, so that it has no siblings outside itself.
 */
export const siblingFilter = (model: ResourceModel, record: Record<string, unknown>) => {
  const shared = sharedRelations(model, record)
  if (shared.length === 0) return
  return shared.map((field) => `${field.name} = ${JSON.stringify(relationValue(record[field.name]))}`).join(' AND ')
}

/**
 * The files of `records`, every file field of each, but `file` itself, each once by its stored `uri`, with the key of
 * its record and its field.
 */
export const siblingFiles = (model: ResourceModel, records: readonly Record<string, unknown>[], file: ViewedFile) => {
  const fileFields = Object.values(model.fields).filter((field) => field.type === 'file')
  const found = new Map<string, SiblingFile>()
  for (const record of records) {
    for (const field of fileFields) {
      const sibling = viewedFile(record[field.name])
      if (sibling && sibling.uri !== file.uri && !found.has(sibling.uri)) found.set(sibling.uri, { ...sibling, key: recordKey(model, record), field: field.name })
    }
  }
  return [...found.values()]
}
