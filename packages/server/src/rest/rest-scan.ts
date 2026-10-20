import type { TableIndex, TableIndexes } from '@protobase/query'
import type { FieldPath } from './field-path'
import type { Filter, Operator } from './parse-filter'
import type { OrderTerm } from './parse-order'
import { restError } from './rest-error'

/**
 * The kind of index a read of a field needs: `btree` for comparisons, lists and null checks and the sort, `equality`
 * a btree or, on text, a pg_trgm index, which answers `=` as well; `trigram`
 * (pg_trgm) for patterns; `gin` for text search; `containment` a GIN or GiST index for `@>`, `<@` and `&&`; `gist` for
 * the range operators.
 */
type Need = 'btree' | 'equality' | 'trigram' | 'gin' | 'containment' | 'gist'
type Read = { field: FieldPath; need: Need; use: 'filter' | 'sort' | 'join' }

const needs: Record<Operator, Need> = {
  eq: 'equality', neq: 'btree', gt: 'btree', gte: 'btree', lt: 'btree', lte: 'btree', in: 'btree', is: 'btree', isdistinct: 'btree',
  like: 'trigram', ilike: 'trigram', match: 'trigram', imatch: 'trigram',
  fts: 'gin', plfts: 'gin', phfts: 'gin', wfts: 'gin',
  cs: 'containment', cd: 'containment', ov: 'containment',
  sl: 'gist', sr: 'gist', nxr: 'gist', nxl: 'gist', adj: 'gist',
}

const trigramClasses = ['gin_trgm_ops', 'gist_trgm_ops']

const quoted = (name: string) => `"${name.replaceAll('"', '""')}"`

// A JSON path as Postgres prints an index on it, without quotes, parentheses, spaces and `::text`: `meta->>'kind'`.
const pathKey = (path: FieldPath) => path.column + path.json.map((step) => `${step.arrow}${typeof step.key === 'number' ? step.key : `'${step.key}'`}`).join('')
const normalized = (definition: string) => definition.replaceAll('::text', '').replace(/[\s()"]/g, '')

const keyMatches = (key: TableIndex['keys'][number], path: FieldPath) =>
  path.json.length === 0 ? key.column === path.column : key.column === null && normalized(key.definition) === pathKey(path)

const keyName = (key: TableIndex['keys'][number]) => key.column ?? normalized(key.definition)

// A btree index serves a key whose earlier keys are all pinned to one value, so the planner walks one stretch of it.
const serves = (index: TableIndex, read: Read, pinned: ReadonlySet<string>) => {
  if (index.partial) return false
  const position = index.keys.findIndex((key) => keyMatches(key, read.field))
  if (position < 0) return false
  switch (read.need) {
    case 'equality':
      if (trigramClasses.includes(index.keys[position]!.opclass)) return true
      return index.method === 'btree' && index.keys.slice(0, position).every((key) => pinned.has(keyName(key)))
    case 'btree':
      return index.method === 'btree' && index.keys.slice(0, position).every((key) => pinned.has(keyName(key)))
    case 'trigram':
      return trigramClasses.includes(index.keys[position]!.opclass)
    case 'gin':
    case 'containment':
      return index.method === 'gin' || index.method === 'gist'
    case 'gist':
      return index.method === 'gist'
  }
}

// The fields every row the filters keep has one value or one of a list of values for: `eq`, `in` and `is` under AND.
const pinnedFields = (filter: Filter): string[] => {
  if (filter.negated) return []
  if (filter.kind === 'and') return filter.args.flatMap(pinnedFields)
  if (filter.kind === 'condition' && ['eq', 'in', 'is'].includes(filter.operator) && !filter.quantifier) return [pathKey(filter.field)]
  return []
}

const filterReads = (filter: Filter): Read[] =>
  filter.kind === 'condition' ? [{ field: filter.field, need: needs[filter.operator], use: 'filter' }] : filter.args.flatMap(filterReads)

const suggestion = (table: string, read: Read) => {
  const column = read.field.json.length === 0 ? quoted(read.field.column) : `(${pathKey(read.field).replace(read.field.column, quoted(read.field.column))})`
  if (read.need === 'trigram') return `create index on ${table} using gin (${column} gin_trgm_ops)`
  if (read.need === 'gin' || read.need === 'containment') return `create index on ${table} using gin (${column})`
  if (read.need === 'gist') return `create index on ${table} using gist (${column})`
  return `create index on ${table} (${column})`
}

/**
 * The reads of a request no index of the table serves: each column an embed joins on, which equals one value per
 * related row; each filtered field, by the kind of index its operator needs; and the first sort field. A view or a
 * foreign table has no indexes of its own and is not judged.
 */
export const uncoveredReads = (table: TableIndexes, filters: readonly Filter[], order: readonly OrderTerm[], joined: readonly string[] = []) => {
  if (table.kind !== 'table') return []
  const pinned = new Set([...joined, ...filters.flatMap(pinnedFields)])
  const reads: Read[] = [
    ...joined.map((column) => ({ field: { column, json: [] }, need: 'equality' as const, use: 'join' as const })),
    ...filters.flatMap(filterReads),
    ...(order[0] ? [{ field: order[0].field, need: 'btree' as const, use: 'sort' as const }] : []),
  ]
  return reads.filter((read) => !table.indexes.some((index) => serves(index, read, pinned)))
}

/** The 400 error of a read no index serves, with the statement that adds one as its hint. */
export const scanRefusal = (table: { schema?: string; name: string }, read: Read) => {
  const tableName = table.schema ? `${quoted(table.schema)}.${quoted(table.name)}` : quoted(table.name)
  const what = read.use === 'sort' ? 'Sorting by' : read.use === 'join' ? 'Embedding through' : 'Filtering on'
  const index = read.need === 'btree' || read.need === 'equality' ? 'an index' : read.need === 'trigram' ? 'a pg_trgm index' : read.need === 'gist' ? 'a GiST index' : 'a GIN index'
  return restError(400, 'expensive-query', `${what} "${pathKey(read.field)}" needs ${index} that serves it`, null, suggestion(tableName, read))
}
