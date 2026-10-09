import { sql, type Expression, type SqlBool } from 'kysely'
import { columnRef } from './columns'
import { flip, type Direction, type SortKey } from './sort'

type Cell = string | null

const compare = (direction: Direction, inclusive: boolean) =>
  sql.raw(direction === 'asc' ? (inclusive ? '>=' : '>') : (inclusive ? '<=' : '<'))

/**
 * Rows positioned beyond `value` when reading in `direction` (asc puts nulls last, desc puts them first).
 * `inclusive` also keeps rows equal to value; for a null value that means the null rows themselves.
 */
const beyond = (key: SortKey, direction: Direction, value: Cell, inclusive: boolean): Expression<SqlBool> => {
  const column = columnRef(key.field)
  if (value === null) {
    if (direction === 'asc') return inclusive ? sql<SqlBool>`${column} is null` : sql<SqlBool>`false`
    return inclusive ? sql<SqlBool>`true` : sql<SqlBool>`${column} is not null`
  }
  const ordered = sql<SqlBool>`${column} ${compare(direction, inclusive)} ${value}`
  return key.field.nullable && direction === 'asc' ? sql<SqlBool>`(${ordered} or ${column} is null)` : ordered
}

const same = (key: SortKey, value: Cell) => {
  const column = columnRef(key.field)
  return value === null ? sql<SqlBool>`${column} is null` : sql<SqlBool>`${column} = ${value}`
}

/** Rows from a boundary cursor (leading column only): `after` starts at the value, `before` ends just short of it. */
const seekBoundary = (key: SortKey, value: Cell, reading: 'after' | 'before') =>
  reading === 'after' ? beyond(key, key.direction, value, true) : beyond(key, flip(key.direction), value, false)

/** Expanded form: (a beyond x) or (a = x and b beyond y) or ... Handles mixed directions and NULL boundaries. */
const seekExpanded = (keys: SortKey[], values: Cell[]) => {
  const branches = keys.map((key, i) => {
    const equal = keys.slice(0, i).map((prior, j) => same(prior, values[j] ?? null))
    return sql<SqlBool>`(${sql.join([...equal, beyond(key, key.direction, values[i] ?? null, false)], sql` and `)})`
  })
  return sql<SqlBool>`(${sql.join(branches, sql` or `)})`
}

/**
 * Condition selecting rows strictly after (or before) the cursor row in the requested sort.
 * `keys` carry the user-facing directions; `reading` only picks which side of the cursor to read.
 * Row-value comparison is used when every direction matches and no key can be NULL (it cannot order NULLs).
 */
export const seekCondition = (keys: SortKey[], values: Cell[], reading: 'after' | 'before'): Expression<SqlBool> => {
  const [first] = keys
  if (values.length === 1 && keys.length > 1 && first) return seekBoundary(first, values[0] ?? null, reading)
  const effective = keys.map(key => ({ ...key, direction: reading === 'after' ? key.direction : flip(key.direction) }))
  const uniform = effective.every(key => key.direction === effective[0]?.direction)
  const nullable = effective.some(key => key.field.nullable)
  if (!uniform || nullable) return seekExpanded(effective, values)
  const cols = sql.join(effective.map(key => columnRef(key.field)))
  return sql<SqlBool>`(${cols}) ${compare(effective[0]!.direction, false)} (${sql.join(values)})`
}
