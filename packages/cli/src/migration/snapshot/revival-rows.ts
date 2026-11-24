import postgres from 'postgres'
import { keptTables, type StoreNames } from '@protobase/server/internal'
import type { KeptModule } from './snapshot-file'

/** A module turned on again whose kept tables hold rows: each such table with its count, as `name count`, joined. */
export type RevivedRows = { module: KeptModule['module']; found: string }

/**
 * The rows the tables of each module of `revived` kept while off still hold, in the database at `url`, read in a
 * read-only transaction: one count per table. Modules whose tables are empty are left out.
 */
export const revivedRows = async (url: string, names: StoreNames, revived: readonly KeptModule[]): Promise<RevivedRows[]> => {
  const sql = postgres(url, { max: 1, onnotice: () => {} })
  try {
    return await sql.begin('read only', async (tx) => {
      const found: RevivedRows[] = []
      for (const { module, step } of revived) {
        const counts: string[] = []
        for (const table of keptTables(names, module, step)) {
          const [row] = await tx.unsafe<{ rows: number }[]>(`select count(*)::int as rows from ${String(table)}`)
          if (row!.rows > 0) counts.push(`${table.name} ${row!.rows}`)
        }
        if (counts.length > 0) found.push({ module, found: counts.sort().join(', ') })
      }
      return found
    })
  } finally {
    await sql.end()
  }
}
