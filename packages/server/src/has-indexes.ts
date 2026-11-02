import { sql } from 'kysely'
import type { Db } from '@protobase/query'

/** Whether the table `schema`.`table` has an index of each name in `names`. Only reads the catalogue. */
export const hasIndexes = async (db: Db, schema: string, table: string, names: readonly string[]) => {
  const { rows } = await sql<{ name: string }>`select indexname as name from pg_indexes where schemaname = ${schema} and tablename = ${table}`.execute(db)
  return names.every((name) => rows.some((row) => row.name === name))
}
