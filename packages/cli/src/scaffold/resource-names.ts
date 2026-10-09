import { tableKey, type DbTable } from '../db/model'
import { camelCase } from '../infer/names'
import type { ExistingResource } from './existing-config'

// Resource name per "schema.table": the name already in config, else the camelCased table name,
// prefixed with the schema when two tables would collide.
export const assignNames = (tables: DbTable[], existing: ExistingResource[]) => {
  const names = new Map(existing.map((resource) => [resource.table, resource.name]))
  const taken = new Set(names.values())
  const fresh = tables.filter((table) => !names.has(tableKey(table)))
  const counts = new Map<string, number>()
  for (const table of tables) counts.set(camelCase(table.name), (counts.get(camelCase(table.name)) ?? 0) + 1)
  for (const table of fresh) {
    const plain = camelCase(table.name)
    const name = counts.get(plain) === 1 && !taken.has(plain) ? plain : camelCase(`${table.schema}_${table.name}`)
    names.set(tableKey(table), name)
    taken.add(name)
  }
  return names
}
