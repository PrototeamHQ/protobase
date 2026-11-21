import type { CheckedFilter, FieldModel, ResourceModel, SortSpec } from '@protobase/schema'
import { isPatternCompare } from './compile-compare'
import { lookupReadOf } from './lookup-read'
import { fullModelOf, type Scope } from './scope'
import type { TableIndex, TableIndexes } from './table-indexes'

/**
 * The kind of index a column needs for how it is read: `btree` for comparisons, lists of values, null checks and sorts;
 * `trigram` (pg_trgm, GIN or GiST) for patterns, regex, `similar` and text search; `digits` a trigram index on the
 * column's digits (`regexp_replace(column, '[^0-9]', '', 'g')`) for a `digitsEnd` search field; `gin` for JSON; `file`
 * a btree index on a file column's file without its query (`split_part(column, '?', 1)`).
 */
export type IndexNeed = 'btree' | 'trigram' | 'digits' | 'gin' | 'file'
/**
 * Where a column is read: the caller's filter, the access rule's row filter, the relation to a parent the caller must
 * read (`.parent(fk, 'read')`), a `related()` term, the sort, a facet's grouping, the field a read keeps the first rows
 * per value of (`limit_per`), the file cleanup's check that no row holds a file it is about to delete, or the field a
 * lookup field finds each record's linked record by.
 */
export type ColumnUse = 'filter' | 'access' | 'parent' | 'related' | 'sort' | 'facet' | 'per' | 'cleanup' | 'lookup'
/** A column read without an index that serves it, and a statement that adds one. */
export type UncoveredColumn = { field: string; column: string; use: ColumnUse; need: IndexNeed; suggestion: string }
/**
 * What a read does with the table: the filter it keeps rows by, the order it walks them in, a field it groups by, the
 * field a `related()` term selects, and the field it keeps the first rows per value of.
 */
export type CoverageQuery = { filter?: CheckedFilter; sort?: SortSpec; groupBy?: string; selects?: FieldModel; per?: string }

type Context = { model: ResourceModel; indexes: TableIndex[]; use: ColumnUse }

const trigramClasses = ['gin_trgm_ops', 'gist_trgm_ops']

const quoted = (name: string) => `"${name.replaceAll('"', '""')}"`

const tableName = (model: ResourceModel) => {
  const { schema, name } = model.table
  return schema ? `${quoted(schema)}.${quoted(name)}` : quoted(name)
}

const suggestion = (model: ResourceModel, column: string, need: IndexNeed, under?: string) => {
  const table = tableName(model)
  if (under !== undefined) return `create index on ${table} (${quoted(column)}, ${quoted(under)})`
  if (need === 'trigram') return `create index on ${table} using gin (${quoted(column)} gin_trgm_ops)`
  if (need === 'digits') return `create index on ${table} using gin ((regexp_replace(${quoted(column)}, '[^0-9]', '', 'g')) gin_trgm_ops)`
  if (need === 'gin') return `create index on ${table} using gin (${quoted(column)})`
  if (need === 'file') return `create index on ${table} ((split_part(${quoted(column)}, '?', 1)))`
  return `create index on ${table} (${quoted(column)})`
}

/** The columns a filter pins to one value or a list of values in every row it keeps: `=`, `in` and `is null` under AND. */
const pinnedColumns = (filter?: CheckedFilter): string[] => {
  if (!filter) return []
  if (filter.kind === 'and') return filter.args.flatMap(pinnedColumns)
  // A lookup field has no column of this table to pin
  if ('field' in filter && filter.field.lookup) return []
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

// The key the file cleanup looks a column's files up by, as pg_get_indexdef prints it: split_part(photo, '?'::text, 1).
const fileKey = (column: string) => {
  const name = column.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`^split_part\\((${name}|"${name}")(::text)?, '\\?'(::text)?, 1\\)$`)
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
    case 'file': {
      const first = index.keys[0]
      return index.method === 'btree' && first !== undefined && first.column === null && fileKey(column).test(first.definition)
    }
  }
}

/**
 * The file columns of `model` no index looks their files up by, as the file cleanup does before it deletes one: every
 * row, soft-deleted ones too, so a partial index serves none. A plain view or a foreign table can have no index and
 * is not judged.
 */
export const uncoveredFileColumns = (model: ResourceModel, table: TableIndexes): UncoveredColumn[] =>
  table.kind !== 'table'
    ? []
    : Object.values(model.fields)
        .filter((field) => field.type === 'file' && !table.indexes.some((index) => indexServes(index, field.column, 'file', new Set())))
        .map((field) => ({ field: field.name, column: field.column, use: 'cleanup', need: 'file', suggestion: suggestion(model, field.column, 'file') }))

// `also` is a kind of index that serves as well: a pg_trgm index answers `=` on text as a btree index does
const need = (ctx: Context, field: FieldModel, kind: IndexNeed, pinned: Set<string>, also?: IndexNeed): UncoveredColumn[] =>
  ctx.indexes.some((index) => indexServes(index, field.column, kind, pinned) || (also !== undefined && indexServes(index, field.column, also, pinned)))
    ? []
    : [{ field: field.name, column: field.column, use: ctx.use, need: kind, suggestion: suggestion(ctx.model, field.column, kind) }]

// The rows of each value of `per` are read by `per = value` and walked in the sort's order, so one btree index needs
// `per` and under it the sort's first field, every other key before them pinned. Without a sort, `per` alone.
const perNeed = (ctx: Context, per: FieldModel, sort: FieldModel | undefined, pinned: Set<string>): UncoveredColumn[] => {
  if (!sort || sort.column === per.column) return need(ctx, per, 'btree', pinned)
  const under = new Set([...pinned, per.column])
  const serves = (index: TableIndex) => {
    const position = index.keys.findIndex((key) => key.column === sort.column)
    return btreeServes(index, per.column, pinned) && btreeServes(index, sort.column, under) && index.keys.slice(0, position).some((key) => key.column === per.column)
  }
  if (ctx.indexes.some(serves)) return []
  return [{ field: per.name, column: per.column, use: ctx.use, need: 'btree', suggestion: suggestion(ctx.model, per.column, 'btree', sort.column) }]
}

// A lookup field is read through its link, the relation or key the linked records are matched with, by `in` and by
// one linked record per row; its linked field is judged against the linked table (see `lookupQueries`).
const linkOf = (field: FieldModel) => lookupReadOf(field)?.link ?? field

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
  if ('field' in node && node.field.lookup) return need(ctx, linkOf(node.field), 'btree', pinned)
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

// The first entry of a column and need stays, so a stronger one goes first: the per field's index with the sort
// under it also serves the field's filter, parent and related() reads
const unique = (columns: UncoveredColumn[]) =>
  columns.filter((column, i) => columns.findIndex((other) => other.column === column.column && other.need === column.need) === i)

/**
 * The columns a read of the resource would read without an index serving them; empty when every one is served. The
 * filter's and the access row filter's columns each need an index of the kind their operator uses, the sort's first
 * field, a grouped field and each relation to a parent the caller must read a btree index; the parent's own reads are
 * judged against its table by a call of their own. Tenant, soft delete and `=` terms pin columns, so a later key of a
 * btree index serves under them. A `related()` term is judged as a parent is and pins its relation as `in()` does, and
 * the read of its resource also needs a btree index on the key it selects. A read that keeps the first rows per value
 * of a field needs a btree index on that field with the sort's first field under it, which serves the sort too.
 * A lookup field read in any of these ways needs a btree index on its link instead; what it reads of the linked
 * table is judged against that table (`lookupQueries`). A plain view or a foreign table has no
 * indexes of its own and is not judged.
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
    ...pinnedColumns(scope?.within),
    ...(scope?.parents ?? []).flatMap((read) => (read.related ? [read.field.column] : [])),
  ])
  const ctx = (use: ColumnUse, of = model): Context => ({ model: of, indexes: table.indexes, use })
  const own = (name: string | undefined) => (name !== undefined && model.fields[name] ? linkOf(model.fields[name]) : undefined)
  const sortField = own(query.sort?.[0]?.[0])
  const groupField = own(query.groupBy)
  const perField = own(query.per)
  return unique([
    ...(perField ? perNeed(ctx('per'), perField, sortField, pinned) : []),
    ...(scope?.rowFilter ? walk(ctx('access', full), scope.rowFilter, pinned, false) : []),
    ...(scope?.parents ?? []).flatMap((read) => need(ctx(read.related ? 'related' : 'parent', full), read.field, 'btree', pinned)),
    ...(query.filter ? walk(ctx('filter'), query.filter, pinned, false) : []),
    ...(scope?.within ? walk(ctx('filter', full), scope.within, pinned, false) : []),
    ...(query.selects ? need(ctx('related', full), query.selects, 'btree', pinned) : []),
    ...(sortField && !perField ? need(ctx('sort'), sortField, 'btree', pinned) : []),
    ...(groupField ? need(ctx('facet'), groupField, 'btree', pinned) : []),
  ])
}
