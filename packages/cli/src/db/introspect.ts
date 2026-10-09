import type { Sql } from './connect'
import { tableKey, type DbTable } from './model'
import { selectChecks, selectColumns, selectForeignKeys, selectIndexes, type Relations } from './queries'

const byTable = <T extends { schema: string; table: string }>(rows: readonly T[]) => {
  const groups = new Map<string, T[]>()
  for (const row of rows) {
    const key = tableKey({ schema: row.schema, name: row.table })
    groups.set(key, [...(groups.get(key) ?? []), row])
  }
  return groups
}

const kinds: Record<string, DbTable['kind']> = { r: 'table', p: 'table', v: 'view', m: 'materialized view' }

export const introspect = async (sql: Sql, relations: Relations = {}): Promise<DbTable[]> => {
  const [columns, foreignKeys, checks, indexes] = await Promise.all([
    selectColumns(sql, relations),
    selectForeignKeys(sql, relations),
    selectChecks(sql, relations),
    selectIndexes(sql, relations),
  ])
  const fks = byTable(foreignKeys)
  const chks = byTable(checks)
  const idxs = byTable(indexes)

  return [...byTable(columns)].map(([key, rows]) => ({
    schema: rows[0]!.schema,
    name: rows[0]!.table,
    kind: kinds[rows[0]!.relkind]!,
    columns: rows.map(({ schema, table, relkind, enumValues, defaultExpr, ...column }) => ({
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
