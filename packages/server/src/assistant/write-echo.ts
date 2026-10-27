/**
 * What a write tool gives back of a record it wrote: its key, its new ETag, the fields the write set and the read-only
 * fields, such as a formula or an update time, that changed; so changing one field of a large record stays small. The
 * tool's `fields` argument names more to give back, `*` the whole record.
 */
import type { ResourceModel } from '@protobase/schema'
import type { Row } from '../types'

export const fieldsParameter = {
  type: 'array',
  items: { type: 'string' },
  description: 'More fields of the written record to return than its key, etag, the fields written and the read-only fields that changed; ["*"] returns all of them.',
}

/** `fields` as a list of field names, absent being none; undefined for any other value. */
export const echoFieldsOf = (value: unknown) => {
  if (value === undefined) return []
  if (Array.isArray(value) && value.every((name) => typeof name === 'string' && name !== '')) return value as string[]
  return undefined
}

export const invalidFields = JSON.stringify({ error: 'invalid-parameter', message: 'Invalid parameter fields: pass a list of field names, or ["*"] for all' })

// JSON is what the model reads, so two values are the same when they read the same.
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

// Without the record as it was, as on a create, a read-only field changed when it has a value.
const readOnlyChanged = (model: ResourceModel | undefined, record: Row, before: Row | undefined) =>
  Object.values(model?.fields ?? {})
    .filter((field) => field.readOnly && (before ? !same(before[field.name], record[field.name]) : record[field.name] !== null))
    .map((field) => field.name)

// The key as the tools take it: its value, or the values of its key fields in order.
const keyOf = (model: ResourceModel, record: Row) => {
  const parts = model.primaryKey.map((name) => record[name])
  return parts.length === 1 ? parts[0] : parts
}

const pick = (record: Row, names: string[]) => Object.fromEntries(names.filter((name) => Object.hasOwn(record, name)).map((name) => [name, record[name]]))

/**
 * The written record, small: `before` is the record as the caller read it before the write, undefined for a create or
 * one they could not read. Without the resource's model, the key and the read-only fields are unknown and left out.
 */
export const writeEcho = (model: ResourceModel | undefined, written: { record: Row; etag: string }, data: Row, before: Row | undefined, fields: string[]) => {
  const { record, etag } = written
  const echoed = fields.includes('*') ? record : pick(record, [...Object.keys(data), ...readOnlyChanged(model, record, before), ...fields])
  return { ...(model && { key: keyOf(model, record) }), etag, record: echoed }
}
