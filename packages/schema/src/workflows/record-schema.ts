import type { FieldModel, ResourceModel } from '../model'

type JsonSchema = Record<string, unknown>

/** How a record is used: as an API answer gives it (`read`), or as a create or an update takes it (`write`). */
export type RecordUse = 'read' | 'write'

const fileSchema: JsonSchema = { type: 'object', title: 'File', properties: { uri: { type: 'string' }, name: { type: 'string' }, type: { type: 'string' }, size: { type: 'integer' } } }

/** The type of the key of a resource a relation points at, by the resource's name; undefined when it is not known. */
export type KeyType = (resource: string) => FieldModel['type'] | undefined

// A relation's key as the API gives it: a number for an integer key, text for any other, a bigint's included.
const relationRead = (field: FieldModel, keyType: KeyType | undefined): JsonSchema => (field.relation && keyType?.(field.relation.resource) === 'integer' ? { type: 'integer' } : { type: 'string' })

// A field's value as the API gives it, and as a write takes it: a bigint and a decimal come as text and are written as
// text or a number, as is a relation's key.
const valueSchema = (field: FieldModel, use: RecordUse, keyType: KeyType | undefined): JsonSchema => {
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
    case 'relation':
      return use === 'read' ? relationRead(field, keyType) : { type: ['string', 'integer'] }
    case 'bigint':
      return use === 'read' ? { type: 'string' } : { type: ['string', 'integer'] }
    case 'decimal':
      return use === 'read' ? { type: 'string' } : { type: ['string', 'number'] }
    default:
      return { type: 'string' }
  }
}

// A write to a field that may be null takes null too. A read stays typed by its value, so an optional field still
// feeds an argument of its type, as a read of any value that may be missing does.
const fieldSchema = (field: FieldModel, use: RecordUse, keyType: KeyType | undefined): JsonSchema => {
  const schema = valueSchema(field, use, keyType)
  if (use === 'read' || !field.nullable || schema.type === undefined) return schema
  const types = Array.isArray(schema.type) ? schema.type : [schema.type]
  return { ...schema, type: [...types, 'null'], ...(Array.isArray(schema.enum) && { enum: [...schema.enum, null] }) }
}

/**
 * A resource's record as JSON Schema, titled `title`: each field's value as `use` says, the read-only fields left out
 * of a write, and a relation read as its target's key, by `keyType`. Workflows type a step's record input and output
 * with it.
 */
export const recordJsonSchema = (model: ResourceModel, use: RecordUse, title = model.name, keyType?: KeyType): JsonSchema => ({
  type: 'object',
  title,
  properties: Object.fromEntries(Object.values(model.fields).filter((field) => use === 'read' || !field.readOnly).map((field) => [field.name, fieldSchema(field, use, keyType)])),
})

/** The type of each resource's key, from the app's resources by name: a one-field key's type. */
export const keyTypes = (model: (resource: string) => ResourceModel | undefined): KeyType => (resource) => {
  const found = model(resource)
  return found?.primaryKey.length === 1 ? found.fields[found.primaryKey[0]!]?.type : undefined
}
