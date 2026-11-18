import { IdentifierNode, TableNode, type OperationNode } from 'kysely'

// The names the model resolves, as values that print themselves: inside Kysely's `sql` template through
// `toOperationNode`, as quoted SQL text through `toString`, and as a plain `name` for Kysely's typed builder.

const quoted = (name: string) => `"${name.replaceAll('"', '""')}"`

/** A table of the auth store, in its schema; the search path decides when `schema` is undefined. */
export type TableId = {
  schema: string | undefined
  table: string
  /** The table's own name, as Kysely's typed builder takes it, with `withSchema(schema)`. */
  name: string
  toOperationNode: () => OperationNode
  toString: () => string
}

/** A column of a table, which prints as its name alone, as DDL and a select list with an alias name it. */
export type ColumnId = { schema: string | undefined; table: string; column: string; name: string; toOperationNode: () => OperationNode; toString: () => string }

/** An index, which prints as its name alone: Postgres makes it in its table's schema. */
export type IndexId = { schema: string | undefined; table: string; index: string; name: string; toOperationNode: () => OperationNode; toString: () => string }

/**
 * A table reference, not a bare identifier, so a plugin on the app's Kysely that maps tables maps it as it maps Better
 * Auth's own queries.
 */
export const tableId = (schema: string | undefined, table: string): TableId => ({
  schema,
  table,
  name: table,
  toOperationNode: () => (schema === undefined ? TableNode.create(table) : TableNode.createWithSchema(schema, table)),
  toString: () => (schema === undefined ? quoted(table) : `${quoted(schema)}.${quoted(table)}`),
})

export const columnId = ({ schema, table }: TableId, column: string): ColumnId => ({
  schema,
  table,
  column,
  name: column,
  toOperationNode: () => IdentifierNode.create(column),
  toString: () => quoted(column),
})

export const indexId = ({ schema, table }: TableId, index: string): IndexId => ({
  schema,
  table,
  index,
  name: index,
  toOperationNode: () => IdentifierNode.create(index),
  toString: () => quoted(index),
})
