import type { FieldViewModel, ResourceModel } from '@protobase/schema'

// A cell holds one line, so it edits the fields whose editor is one: text on one line, numbers, dates, choices and
// switches. A relation is chosen and a file uploaded on the record page.
const cellTypes = new Set(['text', 'integer', 'bigint', 'decimal', 'date', 'enum', 'boolean', 'currency', 'country'])

/** What is wrong with editing the field `name` of the list in its cell; empty when it can be. */
export const editableErrors = (name: string, model: ResourceModel, hints: FieldViewModel | undefined): string[] => {
  const field = Object.hasOwn(model.fields, name) ? model.fields[name]! : undefined
  if (!field) return [`"${name}" is not a field of ${model.name}`]
  if (field.readOnly) return [`"${name}" is read-only`]
  if (!cellTypes.has(field.type)) return [`"${name}" is a ${field.type} field, which is not edited in a cell`]
  if (hints?.multiline || hints?.markdown) return [`"${name}" runs over several lines, which a cell does not hold`]
  return []
}
