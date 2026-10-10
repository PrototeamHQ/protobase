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

export const f = {
  text: () => make<string>(text),
  integer: () => make<number>(integer),
  bigint: () => make<string>(bigint),
  decimal: (o: { precision: number; scale: number }) => make<string>(decimal, o),
  boolean: () => make<boolean>(boolean),
  date: () => make<string>(date),
  timestamp: () => make<string>(timestamp),
  uuid: () => make<string>(uuid),
  enum: <const T extends readonly string[]>(values: T) =>
    make<T[number]>(enumeration, { enumValues: [...values] }),
  json: () => make<z.infer<ReturnType<typeof z.json>>>(json),
  relation: (resource: string) =>
    new RelationField<string | number>(relation, { ...baseMeta(relation), relation: { resource } }),
  /** A file: its column holds `{provider}:{path}?name=…&size=…` as text, and responses carry `{ uri, name, type, size, url }`. */
  file: () => new FileField<string>(file, { ...baseMeta(file), file: { accept: [], maxSize: defaultMaxSize, provider: 'private' } }),
  currency: () => make<string>(currency),
  country: () => make<string>(country),
}
