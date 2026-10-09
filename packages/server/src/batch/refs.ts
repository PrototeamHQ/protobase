import { encodeKey } from '@protobase/schema'
import { badRequest } from '../problem'
import { decodeKeyText } from '../key'
import type { Entry } from '../registry'
import type { Row } from '../types'
import type { KeyInput, RefInput } from './schema'

/** A record created earlier in the batch, which later operations may point at with `{ $ref: name }`. */
export type Created = { entry: Entry; key: (string | number)[]; record: Row }

const isRef = (value: unknown): value is RefInput =>
  typeof value === 'object' && value !== null && !Array.isArray(value) && '$ref' in value

const valueOf = (created: Map<string, Created>, ref: RefInput): string | number => {
  const target = created.get(ref.$ref)
  if (!target) throw badRequest('unknown-ref', `"${ref.$ref}" is not the ref of an earlier create in this batch`)
  if (ref.field) {
    const value = target.record[ref.field]
    if (typeof value !== 'string' && typeof value !== 'number') throw badRequest('unknown-ref', `"${ref.$ref}" has no readable field "${ref.field}" to point at`)
    return value
  }
  if (target.key.length !== 1) throw badRequest('unknown-ref', `"${ref.$ref}" has a composite key; name the field to point at with { $ref, field }`)
  return target.key[0]!
}

/** Replaces every `{ $ref }` in a record's values with the key (or `field`) of the record it names. */
export const resolveData = (created: Map<string, Created>, data: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(Object.entries(data).map(([name, value]) => [name, isRef(value) ? valueOf(created, value) : value]))

/** A batch key as typed key parts, for `entry`. */
export const resolveKey = (created: Map<string, Created>, entry: Entry, input: KeyInput): (string | number)[] => {
  if (isRef(input)) {
    const target = created.get(input.$ref)
    if (!target) throw badRequest('unknown-ref', `"${input.$ref}" is not the ref of an earlier create in this batch`)
    return input.field ? [valueOf(created, input)] : [...target.key]
  }
  if (typeof input === 'number') return decodeKeyText(entry, String(input))
  if (typeof input === 'string') return decodeKeyText(entry, input)
  return decodeKeyText(entry, encodeKey(input.map((part) => (isRef(part) ? valueOf(created, part) : part))))
}
