import { sql } from 'kysely'
import type { Db } from '@protobase/query'
import type { ResourceModel } from '@protobase/schema'
import { definitionsSchema, userTablesSchema } from './names'

/** The user tables a resource in code owns, as `protobase eject` writes one: over `user_tables.<name>`, with that name. */
export const ownedTableNames = (models: readonly ResourceModel[]) =>
  models.filter((model) => model.table.schema === userTablesSchema && model.table.name === model.name).map((model) => model.name)

const literal = (text: string) => `'${text.replaceAll("'", "''")}'`

/**
 * The delete of the definitions of the user tables a resource in code owns, with their fields; their tables and rows
 * stay. `undefined` when no such definition is left. `protobase migration` writes it once the code that owns them has
 * deployed, so a definition goes in a later deploy than the one that stopped reading it.
 */
export const ownedDefinitionsMigration = async (db: Db, models: readonly ResourceModel[]) => {
  const owned = ownedTableNames(models)
  if (owned.length === 0) return
  const { rows: found } = await sql<{ found: boolean }>`select to_regclass(${`${definitionsSchema}.tables`}) is not null as found`.execute(db)
  if (!found[0]!.found) return
  const { rows } = await sql<{ name: string }>`select name from ${sql.table(`${definitionsSchema}.tables`)} where name = any(${owned}) order by name`.execute(db)
  if (rows.length === 0) return
  return `delete from ${definitionsSchema}.tables where name in (${rows.map((row) => literal(row.name)).join(', ')});`
}
