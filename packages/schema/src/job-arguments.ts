import { z } from 'zod'
import type { FieldMeta, FieldTypeDef } from './field'
import { bigint } from './fields/bigint'
import { boolean } from './fields/boolean'
import { country } from './fields/country'
import { currency } from './fields/currency'
import { date } from './fields/date'
import { decimal } from './fields/decimal'
import { enumeration } from './fields/enum'
import { integer } from './fields/integer'
import { json } from './fields/json'
import { text } from './fields/text'
import { timestamp } from './fields/timestamp'
import { uuid } from './fields/uuid'

/** The type of a job's argument: one of the field types, each holding the value a record's field of that type holds. */
export type ArgumentType = 'text' | 'integer' | 'bigint' | 'decimal' | 'boolean' | 'date' | 'timestamp' | 'uuid' | 'enum' | 'json' | 'currency' | 'country'

const argumentTypes: Record<ArgumentType, FieldTypeDef> = { text, integer, bigint, decimal, boolean, date, timestamp, uuid, enum: enumeration, json, currency, country }

/**
 * One argument of a job, as plain data: its type, such as `'bigint'`, or the type with its options, such as
 * `{ type: 'enum', values: ['day', 'week'] }`, `{ type: 'integer', min: 1, optional: true }` or
 * `{ type: 'decimal', precision: 8, scale: 2 }`. A value is checked as a field of that type checks it.
 */
export type ArgumentSpec =
  | ArgumentType
  | {
      /** The argument's type. */
      type: ArgumentType
      /** It may be left out. */
      optional?: boolean
      /** An enum's values. */
      values?: string[]
      /** The least value, or for text the shortest length. */
      min?: number
      /** The greatest value, or for text the longest length. */
      max?: number
      /** A decimal's number of digits. */
      precision?: number
      /** A decimal's number of digits after the point. */
      scale?: number
    }

/** A job's arguments by name. */
export type ArgumentsSpec = Record<string, ArgumentSpec>

// The field settings an argument's options stand for.
const metaOf = (spec: Exclude<ArgumentSpec, ArgumentType>): FieldMeta => ({
  type: spec.type,
  nullable: false,
  readOnly: false,
  filterable: false,
  sortable: false,
  aliases: [],
  hasDefault: false,
  ...(spec.values && { enumValues: spec.values }),
  ...(spec.min !== undefined && { min: spec.min }),
  ...(spec.max !== undefined && { max: spec.max }),
  ...(spec.precision !== undefined && { precision: spec.precision }),
  ...(spec.scale !== undefined && { scale: spec.scale }),
})

const argumentSchema = (job: string, name: string, given: ArgumentSpec) => {
  const spec = typeof given === 'string' ? { type: given } : given
  const def = argumentTypes[spec.type]
  if (!def) throw new Error(`Job "${job}": argument "${name}" has the type "${spec.type}", which is none of ${Object.keys(argumentTypes).join(', ')}`)
  const schema = def.build(metaOf(spec))
  return spec.optional ? schema.optional() : schema
}

/**
 * The schema a job's payload is checked with, from its declared arguments: an object of exactly those arguments, each
 * checked as a field of its type. A Standard Schema, as `defineJob`'s `payload` takes. Throws on an unknown type or an
 * option its type needs, such as a decimal without `precision`, naming the job and the argument.
 */
export const argumentsSchema = (job: string, spec: ArgumentsSpec) =>
  z.strictObject(Object.fromEntries(Object.entries(spec).map(([name, given]) => [name, argumentSchema(job, name, given)])))
