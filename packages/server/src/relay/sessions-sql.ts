import { sql } from 'kysely'
import type { Db } from '@protobase/query'
import { migrationCommand } from '../changes/capture-schema'
import { jobsSchema } from '../jobs/schema'

/** The schema of the relay's database objects. */
export const relaySchema = 'relay'

/** The job a deleted session queues, which closes its sockets on the relay. */
export const closeSessionsJob = 'relay.close-sessions'

/** Bumped whenever the objects below change, so the next migration writes them again. */
const sessionsVersion = 1
const sessionsComment = `Protobase relay sessions ${sessionsVersion}`

const triggerName = 'relay_session_ended'

/**
 * The trigger that ends a deleted sign-in session's sockets: one `relay.close-sessions` job for each statement that
 * deletes sessions, in its transaction, with their ids, whatever deleted them: a sign-out, a revoke, a ban, a newer
 * sign-in in the same browser or SQL. Sessions are deleted rather than marked, so the delete stands for the end.
 */
export const sessionsSql = (sessions: string) => [
  `create schema if not exists ${relaySchema}`,
  `create or replace function ${relaySchema}.session_ended() returns trigger
language plpgsql as $$
declare
  ids jsonb;
begin
  select jsonb_agg(id::text) into ids from ended;
  if ids is not null then
    perform ${jobsSchema}.enqueue('${closeSessionsJob}', jsonb_build_object('sessions', ids));
  end if;
  return null;
end
$$`,
  `comment on function ${relaySchema}.session_ended() is '${sessionsComment}'`,
  `drop trigger if exists ${triggerName} on ${sessions}`,
  `create trigger ${triggerName} after delete on ${sessions} referencing old table as ended for each statement execute function ${relaySchema}.session_ended()`,
]

/**
 * Refuses a sessions table the app's database does not have: the trigger queues its job in the app's jobs queue, so
 * the relay needs the auth store in the app's own database, as the `auth` config puts it.
 */
export const refuseSessionsElsewhere = (table: boolean, sessions: string) => {
  if (table) return
  throw new Error(`The relay needs the sign-in sessions table ${sessions} in the app's own database, whose jobs queue closes ended sessions' sockets, but the app's database has no such table: keep the auth store in the app's database to use the relay.`)
}

// Whether the trigger stands on the sessions table, with the function of this version; refuses a table elsewhere.
const current = async (db: Db, sessions: string) => {
  const { rows } = await sql<{ here: boolean; found: boolean }>`select to_regclass(${sessions}) is not null as here, exists (
      select from pg_trigger t join pg_proc p on p.oid = t.tgfoid
      where t.tgrelid = to_regclass(${sessions}) and t.tgname = ${triggerName} and obj_description(p.oid, 'pg_proc') = ${sessionsComment}
    ) as found`.execute(db)
  refuseSessionsElsewhere(rows[0]!.here, sessions)
  return rows[0]!.found
}

/** The SQL that ends deleted sessions' sockets on the relay (`sessionsSql`); `undefined` when it is current. */
export const relaySessionsMigration = async (db: Db, sessions: string) => {
  if (await current(db, sessions)) return
  return `${sessionsSql(sessions).join(';\n\n')};`
}

/** Refuses to start while deleted sessions would keep their sockets on the relay. */
export const checkRelaySessions = async (db: Db, sessions: string) => {
  if (await current(db, sessions)) return
  throw new Error(`The trigger that closes a deleted session's sockets on the relay is missing or out of date on ${sessions}. Write it as a migration with \`${migrationCommand}\`, apply it with the project's migrations, then start again.`)
}
