import type { CheckedFilter, FieldModel, ResourceModel, SortSpec } from '@protobase/schema'
import { isPatternCompare } from './compile-compare'
import { fullModelOf, type Scope } from './scope'
import type { TableIndex, TableIndexes } from './table-indexes'

/**
 * The kind of index a column needs for how it is read: `btree` for comparisons, lists of values, null checks and sorts;
 * `trigram` (pg_trgm, GIN or GiST) for patterns, regex, `similar` and text search; `digits` a trigram index on the
 * column's digits (`regexp_replace(column, '[^0-9]', '', 'g')`) for a `digitsEnd` search field; `gin` for JSON.
 */
export type IndexNeed = 'btree' | 'trigram' | 'digits' | 'gin'
/**
 * Where a column is read: the caller's filter, the access rule's row filter, the relation to a parent the caller must
 * read (`.parent(fk, 'read')`), the sort, or a facet's grouping.
 */
export type ColumnUse = 'filter' | 'access' | 'parent' | 'sort' | 'facet'
/** A column read without an index that serves it, and a statement that adds one. */
export type UncoveredColumn = { field: string; column: string; use: ColumnUse; need: IndexNeed; suggestion: string }
/** What a read does with the table: the filter it keeps rows by, the order it walks them in, a field it groups by. */
export type CoverageQuery = { filter?: CheckedFilter; sort?: SortSpec; groupBy?: string }

type Context = { model: ResourceModel; indexes: TableIndex[]; use: ColumnUse }

const trigramClasses = ['gin_trgm_ops', 'gist_trgm_ops']

const quoted = (name: string) => `"${name.replaceAll('"', '""')}"`

const tableName = (model: ResourceModel) => {
  const { schema, name } = model.table
  return schema ? `${quoted(schema)}.${quoted(name)}` : quoted(name)
}

const suggestion = (model: ResourceModel, column: string, need: IndexNeed) => {
  const table = tableName(model)
  if (need === 'trigram') return `create index on ${table} using gin (${quoted(column)} gin_trgm_ops)`
  if (need === 'digits') return `create index on ${table} using gin ((regexp_replace(${quoted(column)}, '[^0-9]', '', 'g')) gin_trgm_ops)`
  if (need === 'gin') return `create index on ${table} using gin (${quoted(column)})`
  return `create index on ${table} (${quoted(column)})`
}

/** The columns a filter pins to one value or a list of values in every row it keeps: `=`, `in` and `is null` under AND. */
const pinnedColumns = (filter?: CheckedFilter): string[] => {
  if (!filter) return []
  if (filter.kind === 'and') return filter.args.flatMap(pinnedColumns)
  if (filter.kind === 'compare') return filter.op === '=' && !isPatternCompare(filter) ? [filter.field.column] : []
  if (filter.kind === 'in' || filter.kind === 'isNull') return [filter.field.column]
  return []
}

// A btree index serves a column that is one of its keys when every key before it is pinned by the query, so the
// planner walks one stretch of the index: (for_sale, status, published_at) serves `published_at` under
// `for_sale = true AND status = "available"`. A partial index serves only queries implying its WHERE, so none counts.
const btreeServes = (index: TableIndex, column: string, pinned: ReadonlySet<string>) => {
  if (index.method !== 'btree' || index.partial) return false
  const position = index.keys.findIndex((key) => key.column === column)
  return position >= 0 && index.keys.slice(0, position).every((key) => key.column !== null && pinned.has(key.column))
}

const mentions = (definition: string, column: string) => {
  const name = column.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(^|[^\\w"])("${name}"|${name})([^\\w"]|$)`).test(definition)
}

/** Whether the index serves reading the column with the given need, while the query pins the `pinned` columns. */
export const indexServes = (index: TableIndex, column: string, need: IndexNeed, pinned: ReadonlySet<string>) => {
  if (index.partial) return false
  switch (need) {
    case 'btree':
      return btreeServes(index, column, pinned)
    case 'trigram':
      return index.keys.some((key) => key.column === column && trigramClasses.includes(key.opclass))
    case 'digits':
      return index.keys.some((key) => key.column === null && trigramClasses.includes(key.opclass) && key.definition.includes('regexp_replace') && mentions(key.definition, column))
    case 'gin':
      return index.method === 'gin' && index.keys.some((key) => key.column === column)
  }
}

// `also` is a kind of index that serves as well: a pg_trgm index answers `=` on text as a btree index does
const need = (ctx: Context, field: FieldModel, kind: IndexNeed, pinned: Set<string>, also?: IndexNeed): UncoveredColumn[] =>
  ctx.indexes.some((index) => indexServes(index, field.column, kind, pinned) || (also !== undefined && indexServes(index, field.column, also, pinned)))
    ? []
    : [{ field: field.name, column: field.column, use: ctx.use, need: kind, suggestion: suggestion(ctx.model, field.column, kind) }]

const compareNeed = (ctx: Context, node: Extract<CheckedFilter, { kind: 'compare' }>, pinned: Set<string>) => {
  if (isPatternCompare(node)) return need(ctx, node.field, 'trigram', pinned)
  return need(ctx, node.field, 'btree', pinned, node.op === '=' && node.field.type === 'text' ? 'trigram' : undefined)
}

const searchNeeds = (ctx: Context, pinned: Set<string>) =>
  (ctx.model.search ?? []).flatMap((name) => {
    const field = ctx.model.fields[name]
    if (!field) throw new Error(`Not implemented: search field "${name}" is not a field of "${ctx.model.name}", which the model builder refuses`)
    return need(ctx, field, ctx.model.searchMatch?.[name] === 'digitsEnd' ? 'digits' : 'trigram', pinned)
  })

// Negation keeps the columns it reads but pins none, so an OR branch under NOT adds nothing to what is pinned
const walk = (ctx: Context, node: CheckedFilter, pinned: Set<string>, negated: boolean): UncoveredColumn[] => {
  switch (node.kind) {
    case 'and':
      return node.args.flatMap((arg) => walk(ctx, arg, pinned, negated))
    case 'or':
      return node.args.flatMap((arg) => walk(ctx, arg, negated ? pinned : new Set([...pinned, ...pinnedColumns(arg)]), negated))
    case 'not':
      return walk(ctx, node.arg, pinned, true)
    case 'compare':
      return compareNeed(ctx, node, pinned)
    case 'in':
    case 'isNull':
      return need(ctx, node.field, 'btree', pinned)
    case 'present':
      return need(ctx, node.field, node.field.type === 'json' ? 'gin' : 'btree', pinned)
    case 'has':
      return need(ctx, node.field, 'gin', pinned)
    case 'regex':
    case 'similar':
      return need(ctx, node.field, 'trigram', pinned)
    case 'search':
      return searchNeeds(ctx, pinned)
  }
}

const unique = (columns: UncoveredColumn[]) =>
  columns.filter((column, i) => columns.findIndex((other) => other.column === column.column && other.need === column.need) === i)

/**
 * The columns a read of the resource would read without an index serving them; empty when every one is served. The
 * filter's and the access row filter's columns each need an index of the kind their operator uses, the sort's first
 * field, a grouped field and each relation to a parent the caller must read a btree index; the parent's own reads are
 * judged against its table by a call of their own. Tenant, soft delete and `=` terms pin columns, so a later key of a
 * btree index serves under them. A plain view or a foreign table has no indexes of its own and is not judged.
 */
export const uncoveredColumns = (model: ResourceModel, table: TableIndexes, query: CoverageQuery, scope?: Scope): UncoveredColumn[] => {
  if (table.kind !== 'table') return []
  const full = fullModelOf(model, scope)
  const columnOf = (name?: string) => (name && Object.hasOwn(full.fields, name) ? [full.fields[name]!.column] : name ? [name] : [])
  const pinned = new Set([
    ...columnOf(full.tenant ?? model.tenant),
    ...columnOf(full.softDelete ?? model.softDelete),
    ...pinnedColumns(scope?.rowFilter),
    ...pinnedColumns(query.filter),
  ])
  const ctx = (use: ColumnUse, of = model): Context => ({ model: of, indexes: table.indexes, use })
  const sortField = query.sort?.[0] && model.fields[query.sort[0][0]]
  const groupField = query.groupBy !== undefined ? model.fields[query.groupBy] : undefined
  return unique([
    ...(scope?.rowFilter ? walk(ctx('access', full), scope.rowFilter, pinned, false) : []),
    ...(scope?.parents ?? []).flatMap((read) => need(ctx('parent', full), read.field, 'btree', pinned)),
    ...(query.filter ? walk(ctx('filter'), query.filter, pinned, false) : []),
    ...(sortField ? need(ctx('sort'), sortField, 'btree', pinned) : []),
    ...(groupField ? need(ctx('facet'), groupField, 'btree', pinned) : []),
  ])
}
