import type { FieldModel, ResourceModel } from '../model'

type JsonSchema = Record<string, unknown>

/** How a record is used: as an API answer gives it (`read`), or as a create or an update takes it (`write`). */
export type RecordUse = 'read' | 'write'

const fileSchema: JsonSchema = { type: 'object', title: 'File', properties: { uri: { type: 'string' }, name: { type: 'string' }, type: { type: 'string' }, size: { type: 'integer' } } }

// A field's value as the API gives it, and as a write takes it: a bigint and a decimal come as text and are written as
// text or a number, as is a relation's key.
const fieldSchema = (field: FieldModel, use: RecordUse): JsonSchema => {
  if (field.file) return fileSchema
  switch (field.type) {
    case 'integer':
      return { type: 'integer' }
    case 'boolean':
      return { type: 'boolean' }
    case 'json':
      return {}
    case 'enum':
      return { type: 'string', ...(field.enumValues && { enum: field.enumValues }) }
    case 'bigint':
    case 'relation':
      return use === 'read' ? { type: 'string' } : { type: ['string', 'integer'] }
    case 'decimal':
      return use === 'read' ? { type: 'string' } : { type: ['string', 'number'] }
    default:
      return { type: 'string' }
  }
}

/**
 * A resource's record as JSON Schema, titled `title`: each field's value as `use` says, the read-only fields left out
 * of a write. Workflows type a step's record input and output with it.
 */
export const recordJsonSchema = (model: ResourceModel, use: RecordUse, title = model.name): JsonSchema => ({
  type: 'object',
  title,
  properties: Object.fromEntries(Object.values(model.fields).filter((field) => use === 'read' || !field.readOnly).map((field) => [field.name, fieldSchema(field, use)])),
})
