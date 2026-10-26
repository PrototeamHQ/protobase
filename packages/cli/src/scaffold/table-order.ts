import { tableKey, type DbTable } from '../db/model'

/**
 * The tables in the order their resources are registered in config/index.ts, which is the sidebar's and so the table
 * the app opens on: each after the tables its foreign keys point to, otherwise by name. A cycle of foreign keys is
 * broken where the walk by name first meets it.
 */
export const dependencyOrder = (tables: DbTable[]) => {
  const byKey = new Map([...tables].sort((a, b) => tableKey(a).localeCompare(tableKey(b))).map((table) => [tableKey(table), table]))
  const ordered: DbTable[] = []
  const visited = new Set<string>()
  const visit = (key: string) => {
    const table = byKey.get(key)
    if (!table || visited.has(key)) return
    visited.add(key)
    for (const foreignKey of table.foreignKeys) visit(tableKey({ schema: foreignKey.refSchema, name: foreignKey.refTable }))
    ordered.push(table)
  }
  for (const key of byKey.keys()) visit(key)
  return ordered
}
