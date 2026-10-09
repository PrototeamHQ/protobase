import type { Sql } from './connect'
import { tableKey, type DbTable } from './model'
import { selectChecks, selectColumns, selectForeignKeys, selectIndexes } from './queries'

const byTable = <T extends { schema: string; table: string }>(rows: readonly T[]) => {
  const groups = new Map<string, T[]>()
  for (const row of rows) {
    const key = tableKey({ schema: row.schema, name: row.table })
    groups.set(key, [...(groups.get(key) ?? []), row])
  }
  return groups
}

export const introspect = async (sql: Sql): Promise<DbTable[]> => {
  const [columns, foreignKeys, checks, indexes] = await Promise.all([
    selectColumns(sql),
    selectForeignKeys(sql),
    selectChecks(sql),
    selectIndexes(sql),
  ])
  const fks = byTable(foreignKeys)
  const chks = byTable(checks)
  const idxs = byTable(indexes)

  return [...byTable(columns)].map(([key, rows]) => ({
    schema: rows[0]!.schema,
    name: rows[0]!.table,
    columns: rows.map(({ schema, table, enumValues, defaultExpr, ...column }) => ({
      ...column,
      enumValues: enumValues ?? [],
      ...(defaultExpr !== null && { defaultExpr }),
    })),
    foreignKeys: (fks.get(key) ?? []).map(({ columns, refSchema, refTable, refColumns }) => ({
      columns,
      refSchema,
      refTable,
      refColumns,
    })),
    checks: (chks.get(key) ?? []).map(({ columns, definition }) => ({ columns, definition })),
    indexes: (idxs.get(key) ?? []).map(({ schema, table, ...index }) => index),
  }))
}
