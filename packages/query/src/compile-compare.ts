import { sql, type Expression, type SqlBool } from 'kysely'
import type { CheckedFilter } from '@protobase/schema'
import { wildcardPattern } from './fields/text'
import { columnRef } from './columns'
import { paramFor } from './field-values'

const operators = { '=': '=', '!=': '<>', '<': '<', '<=': '<=', '>': '>', '>=': '>=' }

type Compare = Extract<CheckedFilter, { kind: 'compare' }>
type In = Extract<CheckedFilter, { kind: 'in' }>

/** `=` and `!=` on text with a `*` in the value become (NOT) ILIKE with the rest escaped. */
export const compileCompare = ({ field, op, value }: Compare): Expression<SqlBool> => {
  const col = columnRef(field)
  if (field.type === 'text' && (op === '=' || op === '!=') && value.kind === 'string' && value.value.includes('*')) {
    const pattern = wildcardPattern(value.value)
    return op === '=' ? sql<SqlBool>`${col} ilike ${pattern}` : sql<SqlBool>`${col} not ilike ${pattern}`
  }
  return sql<SqlBool>`${col} ${sql.raw(operators[op])} ${paramFor(value, field)}`
}

export const compileIn = ({ field, values }: In): Expression<SqlBool> =>
  sql<SqlBool>`${columnRef(field)} in (${sql.join(values.map(value => paramFor(value, field)))})`
