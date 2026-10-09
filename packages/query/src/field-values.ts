import type { FieldType } from '@protobase/schema'
import { toParam as bigint } from './fields/bigint'
import { toParam as boolean } from './fields/boolean'
import { toParam as country } from './fields/country'
import { toParam as currency } from './fields/currency'
import { toParam as date } from './fields/date'
import { toParam as decimal } from './fields/decimal'
import { toParam as enumeration } from './fields/enum'
import { toParam as integer } from './fields/integer'
import { toParam as relation } from './fields/relation'
import { toParam as text } from './fields/text'
import { toParam as timestamp } from './fields/timestamp'
import { toParam as uuid } from './fields/uuid'
import type { ToParam } from './fields/sql-common'
import { QueryError } from './errors'

const byType: Partial<Record<FieldType, ToParam>> = {
  text, integer, bigint, decimal, boolean, date, timestamp, uuid, currency, country, relation, enum: enumeration,
}

/** json and file fields have no scalar comparison; the checker rejects them before they reach here. */
export const paramFor: ToParam = (value, field) => {
  const convert = byType[field.type]
  if (!convert) throw new QueryError('unsupported_field_type', `Field "${field.name}" (${field.type}) cannot be compared`)
  return convert(value, field)
}
