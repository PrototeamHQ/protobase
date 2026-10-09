import type { FieldType, KeyValue, ResourceModel } from './model'

export type KeyType = Extract<FieldType, 'integer' | 'bigint' | 'uuid' | 'text'>

const integerPattern = /^-?\d+$/
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const decodePart = (part: string, type: KeyType): string | number => {
  if (type === 'text') return part
  if (type === 'uuid') {
    if (!uuidPattern.test(part)) throw new Error('Invalid uuid key part')
    return part
  }
  if (!integerPattern.test(part)) throw new Error(`Invalid ${type} key part`)
  if (type === 'bigint') return part
  const value = Number(part)
  if (!Number.isSafeInteger(value)) throw new Error('Invalid integer key part')
  return value
}

const decodeComponent = (part: string) => {
  try {
    return decodeURIComponent(part)
  } catch (error) {
    if (error instanceof URIError) throw new Error('Malformed key encoding')
    throw error
  }
}

// A single key is its plain value; composite parts are percent-encoded and comma-joined.
export const encodeKey = (key: KeyValue | readonly KeyValue[]) => {
  if (!Array.isArray(key)) return String(key)
  const parts = key as readonly KeyValue[]
  if (parts.length === 1) return String(parts[0])
  return parts.map((part) => encodeURIComponent(String(part))).join(',')
}

export const decodeKey = (encoded: string, types: readonly KeyType[]) => {
  if (types.length === 0) throw new Error('A key needs at least one part')
  if (types.length === 1) return decodePart(encoded, types[0]!)
  const parts = encoded.split(',')
  if (parts.length !== types.length) {
    throw new Error(`Expected ${types.length} key parts, got ${parts.length}`)
  }
  return parts.map((part, i) => decodePart(decodeComponent(part), types[i]!))
}

const scalarKey = (type: FieldType | undefined): type is KeyType =>
  type === 'text' || type === 'integer' || type === 'bigint' || type === 'uuid'

/**
 * Key part types of a resource's primary key. A relation part takes the key types of the
 * target resource (a composite target contributes one part per key column), so `resolve`
 * is required whenever a relation is part of the key.
 */
export const keyTypes = (
  model: ResourceModel,
  resolve?: (resource: string) => ResourceModel | undefined,
  seen: string[] = [],
): KeyType[] =>
  model.primaryKey.flatMap((name) => {
    const field = model.fields[name]
    if (scalarKey(field?.type)) return [field.type]
    if (field?.type !== 'relation' || !field.relation) {
      throw new Error(`Unsupported primary key type for "${name}"`)
    }
    const { resource, columns } = field.relation
    if (!resolve) throw new Error(`keyTypes needs a resolver for relation "${name}" to "${resource}"`)
    const target = resolve(resource)
    if (!target) throw new Error(`Unknown resource "${resource}" for relation "${name}"`)
    if (seen.includes(target.name)) throw new Error(`Circular primary key through "${resource}"`)
    const types = keyTypes(target, resolve, [...seen, model.name])
    if (types.length !== columns.length) {
      throw new Error(`Relation "${name}" has ${columns.length} column(s) but "${resource}" has a ${types.length}-part key`)
    }
    return types
  })
