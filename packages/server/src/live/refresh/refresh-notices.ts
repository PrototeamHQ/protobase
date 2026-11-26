import { sql } from 'kysely'
import type { Db } from '@protobase/query'
import { quoteIdent } from '../../changes/capture-sql'

/** The resource of a notice that tells one user's pages their access changed, keyed by the user's id. */
export const refreshNotice = '$live'

// A Postgres text array literal, as the driver sends one parameter.
const textArray = (values: readonly string[]) => `{${values.map((value) => JSON.stringify(value)).join(',')}}`

/**
 * Tells these users' open pages, through the live stream's notices, that what they may read changed, so they read
 * again and get new live tokens. The table is locked against other writers first, so the notice commits in the order
 * of its id and no reader skips it.
 */
export const writeRefreshNotices = async (db: Db, schema: string, userIds: readonly string[]) => {
  if (userIds.length === 0) return
  const table = sql.raw(`${quoteIdent(schema)}."notices"`)
  await db.transaction().execute(async (trx) => {
    await sql`lock table ${table} in share row exclusive mode`.execute(trx)
    await sql`insert into ${table} ("resource", "record_key", "operation") select ${refreshNotice}, u, 'update' from unnest(${textArray([...new Set(userIds)])}::text[]) as u`.execute(trx)
  })
}
