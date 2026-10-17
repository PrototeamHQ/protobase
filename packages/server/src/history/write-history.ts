import { sql } from 'kysely'
import type { Db } from '@protobase/query'
import { quoteIdent } from '../changes/capture-sql'
import type { ResourceChange } from '../changes/resource-change'

const historyRow = (change: ResourceChange) => ({
  resource: change.resource,
  record_key: change.key,
  tenant_id: change.tenant === undefined ? null : String(change.tenant),
  operation: change.operation,
  before: change.before ?? null,
  after: change.after ?? null,
  changed: change.changed,
  actor_id: change.actor?.id ?? null,
  actor_roles: change.actor?.roles ?? null,
  database_role: change.databaseRole,
  transaction: change.transaction,
  at: change.at,
})

const typed = [
  ['resource', 'text'],
  ['record_key', 'text'],
  ['tenant_id', 'text'],
  ['operation', 'text'],
  ['before', 'jsonb'],
  ['after', 'jsonb'],
  ['changed', 'jsonb'],
  ['actor_id', 'text'],
  ['actor_roles', 'jsonb'],
  ['database_role', 'text'],
  ['transaction', 'bigint'],
  ['at', 'timestamptz'],
] as const satisfies ReadonlyArray<readonly [keyof ReturnType<typeof historyRow>, string]>

const columns = typed.map(([name]) => `"${name}"`).join(', ')
const types = typed.map(([name, type]) => `"${name}" ${type}`).join(', ')

/** Adds the changes to the history table, in their order: one statement, in the caller's transaction. */
export const writeHistory = async (db: Db, schema: string, changes: readonly ResourceChange[]) => {
  if (changes.length === 0) return
  const rows = JSON.stringify(changes.map(historyRow))
  await sql`insert into ${sql.raw(`${quoteIdent(schema)}."history"`)} (${sql.raw(columns)})
    select ${sql.raw(columns)} from rows from (jsonb_to_recordset(${rows}::jsonb) as (${sql.raw(types)})) with ordinality as r(${sql.raw(columns)}, "position")
    order by "position"`.execute(db)
}
