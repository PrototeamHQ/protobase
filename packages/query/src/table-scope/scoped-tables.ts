import { AliasNode, IdentifierNode, TableNode, type OperationNode } from 'kysely'

/**
 * A table whose rows each belong to one organization: its schema, undefined for a table the search path finds, its
 * name, and the column that holds the organization.
 */
export type ScopedTable = { schema?: string; table: string; column: string }

/**
 * The scoped tables, looked up by the name a query gives. `searchSchema` is the schema the search path finds an
 * unqualified name in, when it is known: a name qualified with it is the same table as the unqualified one.
 */
export type ScopedTables = { tables: readonly ScopedTable[]; searchSchema?: string }

// A table's schema as Postgres finds it: its own, else the search path's, else unknown.
const schemaOf = (schema: string | undefined, searchSchema: string | undefined) => schema ?? searchSchema

/**
 * The scoped table a name stands for, or undefined. An unqualified name is the scoped table only when that table's
 * schema is the one the search path finds, so a project's own `public.member` is never taken for `auth.member`.
 */
export const scopedTableNamed = ({ tables, searchSchema }: ScopedTables, schema: string | undefined, table: string) =>
  tables.find((scoped) => {
    if (scoped.table !== table) return false
    if (scoped.schema === schema) return true
    const theirs = schemaOf(scoped.schema, searchSchema)
    return theirs !== undefined && theirs === schemaOf(schema, searchSchema)
  })

/** The scoped table of a table node, unless an unqualified name is one of the common table expressions in `shadowing`. */
export const scopedTableOf = (scope: ScopedTables, node: TableNode, shadowing: ReadonlySet<string>) => {
  const schema = node.table.schema?.name
  const table = node.table.identifier.name
  if (schema === undefined && shadowing.has(table)) return
  return scopedTableNamed(scope, schema, table)
}

/** A table a query reads or writes, as a `from`, `join`, `using` or target names it: the table and what qualifies its columns. */
export type TableItem = { table: TableNode; qualifier: TableNode }

/** The table of a from item, plain or aliased; undefined for anything else, such as a subquery. */
export const tableItem = (node: OperationNode): TableItem | undefined => {
  if (TableNode.is(node)) return { table: node, qualifier: node }
  if (!AliasNode.is(node) || !TableNode.is(node.node)) return
  if (!IdentifierNode.is(node.alias)) throw new Error('Not implemented: a table aliased by anything but a name')
  return { table: node.node, qualifier: TableNode.create(node.alias.name) }
}
