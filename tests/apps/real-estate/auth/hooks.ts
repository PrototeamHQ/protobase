import { sql } from 'kysely'
import type { AuthHooks } from '@protobase/server'

// Tickets name their assignee by core.users' integer id, so a new user takes the next value of that table's sequence;
// their row there comes with the account (db/migrations/013_auth_users.sql).
export const generateUserId: AuthHooks['generateUserId'] = async ({ db }) => {
  const { rows } = await sql<{ id: string }>`select nextval(pg_get_serial_sequence('core.users', 'id'))::text as id`.execute(db)
  return rows[0]!.id
}
