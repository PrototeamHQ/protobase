import { sql } from 'kysely'
import type { Db } from '@protobase/query'
import { definitionsSchema } from './names'

/**
 * The version of the stored definitions as a whole, from their rows alone: how many there are, the highest id and the
 * sum of their versions. Adding one raises the highest id, which an identity never gives again, removing one lowers the
 * count, and changing one raises its version, so each change moves it, as long as every change of a definition or its
 * fields raises the definition's version. One read of `tables`, which holds a row per table users add.
 */
export const readDefinitionsVersion = async (db: Db) => {
  const { rows } = await sql<{ version: string }>`select count(*) || ':' || coalesce(max(id), 0) || ':' || coalesce(sum(version), 0) as version
    from ${sql.table(`${definitionsSchema}.tables`)}`.execute(db)
  return rows[0]!.version
}
