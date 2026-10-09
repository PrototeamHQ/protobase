import { keyTypes, type KeyType, type FieldModel, type ResourceModel } from '@protobase/schema'
import type { ResourceSource } from './resource-source'

export type EtagSource = { field: FieldModel; kind: 'version' | 'timestamp' }

export type Entry = {
  name: string
  source: ResourceSource
  model: ResourceModel
  keyTypes: KeyType[]
  /** A database-managed `version` or `updated_at` column, when the table has one; otherwise ETags hash the row. */
  etag?: EtagSource
}

export type Registry = {
  entries: Entry[]
  find: (name: string) => Entry | undefined
}


const etagSource = (model: ResourceModel): EtagSource | undefined => {
  const fields = Object.values(model.fields).filter((field) => field.readOnly)
  const version = fields.find((field) => field.column === 'version' && (field.type === 'integer' || field.type === 'bigint'))
  if (version) return { field: version, kind: 'version' }
  const updated = fields.find((field) => field.column === 'updated_at' && field.type === 'timestamp')
  return updated && { field: updated, kind: 'timestamp' }
}

export const buildRegistry = (resources: ResourceSource[]): Registry => {
  const built = resources.map((source) => ({ source, model: source.toModel() }))
  const models = new Map(built.map(({ model }) => [model.name, model]))
  const entries = built.map(({ source, model }): Entry => {
    if (/[/:?#]/.test(model.name)) throw new Error(`Resource name "${model.name}" cannot be used in a URL path`)
    if (Object.hasOwn(model.fields, 'etag')) throw new Error(`Resource "${model.name}" has a field named "etag", which the API uses for the record version`)
    const types = keyTypes(model, (name) => models.get(name))
    if (types.length !== model.primaryKey.length) {
      throw new Error(`Not implemented: resource "${model.name}" has a primary key field that points at a composite-key resource; the server maps one key part per key field`)
    }
    const etag = etagSource(model)
    return {
      name: model.name,
      source,
      model,
      keyTypes: types,
      ...(etag && { etag }),
    }
  })
  const byName = new Map(entries.map((entry) => [entry.name, entry]))
  if (byName.size !== entries.length) throw new Error('Resource names must be unique')
  return { entries, find: (name) => byName.get(name) }
}
