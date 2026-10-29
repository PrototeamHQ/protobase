import type { z } from 'zod'
import { bigint } from './fields/bigint'
import { boolean } from './fields/boolean'
import { country } from './fields/country'
import { currency } from './fields/currency'
import { date } from './fields/date'
import { decimal } from './fields/decimal'
import { enumeration } from './fields/enum'
import { file } from './fields/file'
import { integer } from './fields/integer'
import { json } from './fields/json'
import { relation } from './fields/relation'
import { text } from './fields/text'
import { timestamp } from './fields/timestamp'
import { uuid } from './fields/uuid'
import { Field, type FieldMeta, type FieldTypeDef } from './field'
import { RelationField } from './relation-field'
import { FileField } from './file-field'
import { defaultMaxSize } from './files/file-options'

const baseMeta = (def: FieldTypeDef): FieldMeta => ({
  type: def.type,
  nullable: false,
  readOnly: false,
  filterable: false,
  sortable: false,
  aliases: [],
  hasDefault: false,
})

const make = <V>(def: FieldTypeDef, extra: Partial<FieldMeta> = {}) =>
  new Field<V>(def, { ...baseMeta(def), ...extra })

/**
 * The field builders of a resource's `.fields({ ... })`, one per field type. Each returns a {@link Field} whose options
 * chain in any order. See [Field types](docs/website/src/content/docs/reference/data-config.mdx#field-types).
 *
 * @example
 * ```ts
 * .fields({
 *   id: f.integer().readOnly().filterable().sortable().dbDefault(),
 *   status: f.enum(['booked', 'ready', 'collected']).default('booked').filterable(),
 *   customer_id: f.relation('customers').filterable(),
 *   estimate: f.decimal({ precision: 8, scale: 2 }),
 *   notes: f.text().optional().column('internal_notes'),
 * })
 * ```
 */
export const f = {
  /** Text: a `text`, `varchar` or `bpchar` column. Takes `.min()`, `.max()` (length) and `.regex()`. */
  text: () => make<string>(text),
  /** A 32-bit or smaller integer: an `int2` or `int4` column. Takes `.min()` and `.max()`. */
  integer: () => make<number>(integer),
  /** A 64-bit integer: an `int8` column, a string in the API so that all 64 bits survive. */
  bigint: () => make<string>(bigint),
  /** An exact decimal of `precision` digits, `scale` of them after the point: a `numeric` column, a string in the API. */
  decimal: (o: { precision: number; scale: number }) => make<string>(decimal, o),
  /** A `bool` column. */
  boolean: () => make<boolean>(boolean),
  /** A `date` column, `2026-10-08` in the API. */
  date: () => make<string>(date),
  /** A `timestamp` or `timestamptz` column, ISO 8601 with an offset in the API. */
  timestamp: () => make<string>(timestamp),
  /** A `uuid` column. */
  uuid: () => make<string>(uuid),
  /** One of `values`: a Postgres enum, or text with a `CHECK (... IN ...)`. The record type is the union of the values. */
  enum: <const T extends readonly string[]>(values: T) =>
    make<T[number]>(enumeration, { enumValues: [...values] }),
  /** Any JSON: a `json` or `jsonb` column. */
  json: () => make<z.infer<ReturnType<typeof z.json>>>(json),
  /**
   * The key of a record of `resource`, in that resource's key column(s); the admin shows the other record's title and
   * links to it. A relation to a resource with a key of several columns names them with `.columns()`.
   */
  relation: (resource: string) =>
    new RelationField<string | number>(relation, { ...baseMeta(relation), relation: { resource } }),
  /** A file: its column holds `{provider}:{path}?name=…&size=…` as text, and responses carry `{ uri, name, type, size, url }`. */
  file: () => new FileField<string>(file, { ...baseMeta(file), file: { accept: [], maxSize: defaultMaxSize, provider: 'private' } }),
  /** An ISO 4217 currency code such as `EUR`, in a `text` column. */
  currency: () => make<string>(currency),
  /** An ISO 3166-1 alpha-2 country code such as `NL`, in a `text` column. */
  country: () => make<string>(country),
}
