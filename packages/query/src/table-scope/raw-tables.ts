import { IdentifierNode, RawNode, SelectAllNode, SelectionNode, SelectQueryNode, TableNode, WhereNode, sql, type OperationNode } from 'kysely'
import { ScopeRefused } from './scope-condition'
import { scopedTableNamed, type ScopedTables } from './scoped-tables'

// How raw SQL names a scoped table it means to: `scoped(t)` until the scope prints it as the organization's rows, which
// a database without the scope refuses as an unknown function rather than reading every organization's; `unscoped`
// as a comment before the table, which any database reads as the table itself.
const scopedFragments = ['scoped(', ')']
const unscopedFragments = ['/* unscoped */ ', '']

/**
 * A scoped table in raw `sql`, as the organization's rows: `sql\`select id from ${scoped('auth.member')} as m\``. The
 * table is `schema.table` or `table`, as `sql.table` takes it. Without the scope on the database it runs on, the
 * query fails.
 */
export const scoped = (table: string) => sql`scoped(${sql.table(table)})`

/**
 * A scoped table in raw `sql` with every organization's rows, on purpose: `reason` says why, for whoever reviews it.
 * `db.unscoped(reason)` is the same for a whole query.
 */
export const unscoped = (reason: string, table: string) => {
  if (reason.trim() === '') throw new Error('unscoped needs a reason: say why this query reads every organization')
  return sql`/* unscoped */ ${sql.table(table)}`
}

const fragmentsAre = (node: RawNode, fragments: readonly string[]) => node.sqlFragments.length === fragments.length && node.sqlFragments.every((part, i) => part === fragments[i])

// The table of `sql.table(t)`, a table node in raw SQL of its own.
const tableOf = (node: OperationNode | undefined) => {
  if (node && RawNode.is(node) && fragmentsAre(node, ['', '']) && node.parameters.length === 1) return tableOf(node.parameters[0])
  return node && TableNode.is(node) ? node : undefined
}

/** The table `scoped(t)` wraps, when the node is one. */
export const scopedMark = (node: RawNode) => (fragmentsAre(node, scopedFragments) && node.parameters.length === 1 ? tableOf(node.parameters[0]) : undefined)

/** Whether the node is `unscoped(reason, t)`. */
export const isUnscopedMark = (node: RawNode) => fragmentsAre(node, unscopedFragments)

/** `(select * from <table> where <condition>)`, what `scoped(t)` prints. */
export const scopedRows = (table: TableNode, condition: OperationNode) => ({
  ...SelectQueryNode.createFrom([table]),
  selections: [SelectionNode.create(SelectAllNode.create())],
  where: WhereNode.create(condition),
})

// The ids of `sql.id(...)`: every fragment between two ids is a dot.
const idsOf = (node: RawNode) => {
  if (node.parameters.length === 0 || !node.parameters.every(IdentifierNode.is)) return
  const inner = node.sqlFragments.slice(1, -1)
  if (node.sqlFragments[0] !== '' || node.sqlFragments.at(-1) !== '' || !inner.every((part) => part === '.')) return
  return (node.parameters as IdentifierNode[]).map(({ name }) => name)
}

// The scoped table `sql.id(...)` names: `sql.id(schema, table)`, or `sql.id(table)` for a table the search path finds.
const idNamesScoped = (scope: ScopedTables, ids: string[]) =>
  scopedTableNamed(scope, ids.length >= 2 ? ids[0] : undefined, ids.length >= 2 ? ids[1]! : ids[0]!) !== undefined

const refusal = (name: string) => new ScopeRefused(`Raw SQL names the scoped table ${name}: write scoped('${name}') for the organization's rows, or unscoped('<reason>', '${name}') for every organization's`)

/** Refuses raw SQL that names a scoped table through `sql.table` or `sql.id`, outside `scoped()` and `unscoped()`. */
export const checkRawTables = (scope: ScopedTables, node: RawNode, shadowing: ReadonlySet<string>) => {
  const ids = idsOf(node)
  if (ids && idNamesScoped(scope, ids)) throw refusal(ids.join('.'))
  for (const parameter of node.parameters) {
    if (!TableNode.is(parameter)) continue
    const { schema, identifier } = parameter.table
    if (schema === undefined && shadowing.has(identifier.name)) continue
    if (scopedTableNamed(scope, schema?.name, identifier.name)) throw refusal(schema ? `${schema.name}.${identifier.name}` : identifier.name)
  }
}
