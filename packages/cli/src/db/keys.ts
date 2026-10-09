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

// A column counts as indexed when it leads a valid, non-partial index, or directly follows the tenant
// column in one: every query is tenant-scoped, so the planner can use such an index.
export const leadingIndex = (table: DbTable, column: string, tenantColumn?: string) =>
  table.indexes.find(
    (index) =>
      !index.partial &&
      (index.columns[0] === column || (tenantColumn !== undefined && index.columns[0] === tenantColumn && index.columns[1] === column)),
  )
