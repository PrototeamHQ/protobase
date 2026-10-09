import { sql } from 'kysely'
import { invalidValue, nowExpression, stringValue, type ToParam } from './sql-common'

export const toParam: ToParam = (value, field) => {
  if (value.kind === 'now') return sql`(${nowExpression(value)})::date`
  const text = stringValue(value, field, 'a date (YYYY-MM-DD)')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || Number.isNaN(Date.parse(text))) throw invalidValue(field, 'a date (YYYY-MM-DD)')
  return text
}
