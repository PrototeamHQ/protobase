import type { TableIndex } from '@protobase/query'
import type { DbTable } from './model'

const plainColumns = (columns: (string | null)[]) =>
  columns.every((column) => column !== null) ? (columns as string[]) : undefined

// The primary key, else the first unique, non-partial index whose columns are all NOT NULL.
export const keyColumns = (table: DbTable) => {
  const primary = table.indexes.find((index) => index.primary)
  if (primary) return plainColumns(primary.columns)
  const notNull = new Set(table.columns.filter((column) => column.notNull).map((column) => column.name))
  return table.indexes
    .filter((index) => index.unique && !index.partial)
    .map((index) => plainColumns(index.columns))
    .find((columns) => columns && columns.every((column) => notNull.has(column)))
}

// Unique constraints on exactly these columns, or a subset of them, make the set unique.
export const isUniqueSet = (table: DbTable, columns: readonly string[]) =>
  table.indexes.some((index) => {
    const indexed = plainColumns(index.columns)
    return index.unique && !index.partial && indexed && indexed.every((column) => columns.includes(column))
  })

// The table's indexes in the shape @protobase/query judges coverage on. Introspection keeps no expression text, so an
// expression key's definition is empty: only the `digits` need reads it.
export const coverageIndexes = (table: DbTable): TableIndex[] =>
  table.indexes.map((index) => ({
    name: index.name,
    method: index.method,
    partial: index.partial,
    keys: index.columns.map((column, position) => ({ column, definition: '', opclass: index.opclasses[position] ?? '' })),
  }))
