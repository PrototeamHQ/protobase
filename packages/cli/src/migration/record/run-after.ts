import type { ReservedSql } from 'postgres'
import { recordTable } from '@protobase/server/internal'
import { afterStatements, builtIndex, indexedTable } from './after-file'

/**
 * Runs a migration's `.after.sql` on `sql`'s connection, outside a transaction, one statement at a time, then marks
 * its row in the record complete. An index a statement builds that an earlier run left invalid on the statement's
 * table, as when it was stopped, is dropped first, so it is built again rather than kept half made.
 */
export const runAfter = async (sql: ReservedSql, id: string, text: string) => {
  for (const statement of afterStatements(text)) {
    const index = builtIndex(statement)
    if (index) {
      const invalid = await sql<{ schema: string }[]>`
        select n.nspname as schema from pg_index i join pg_class c on c.oid = i.indexrelid join pg_namespace n on n.oid = c.relnamespace
        where c.relname = ${index.index} and not i.indisvalid and i.indrelid = to_regclass(${indexedTable(statement)!})`
      for (const { schema } of invalid) await sql`drop index concurrently ${sql(schema)}.${sql(index.index)}`
    }
    await sql.unsafe(statement)
  }
  await sql.unsafe(`update ${recordTable} set completed_at = clock_timestamp() where id = $1`, [id])
}
