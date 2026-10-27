import { tableKey, type DbTable } from '../db/model'

export type Referenced = { table: string; by: string[] }

/**
 * The tables of `candidates` that `wanted` points to, directly or through others, and that have no resource yet: a
 * relation names the resource of the table it points to, and the app refuses one whose resource is missing. Each
 * names the tables pointing to it.
 */
export const referencedTables = (candidates: DbTable[], wanted: DbTable[], declared: (key: string) => boolean) => {
  const byKey = new Map(candidates.map((table) => [tableKey(table), table]))
  const included = new Set(wanted.map(tableKey))
  const added = new Map<string, Referenced>()
  const visit = (table: DbTable) => {
    for (const foreignKey of table.foreignKeys) {
      const key = tableKey({ schema: foreignKey.refSchema, name: foreignKey.refTable })
      const target = byKey.get(key)
      if (!target || declared(key)) continue
      const known = added.get(key)
      if (known && !known.by.includes(tableKey(table))) known.by.push(tableKey(table))
      if (included.has(key)) continue
      included.add(key)
      added.set(key, { table: key, by: [tableKey(table)] })
      visit(target)
    }
  }
  for (const table of wanted) visit(table)
  return { tables: candidates.filter((table) => included.has(tableKey(table))), referenced: [...added.values()] }
}
