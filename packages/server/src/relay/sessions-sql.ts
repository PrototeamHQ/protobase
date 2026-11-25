import { sql } from 'kysely'
import type { Db } from '@protobase/query'
import { jobsSchema } from '../jobs/schema'

/** The schema of the relay's database objects. */
export const relaySchema = 'relay'

/** The job a deleted session queues, which closes its sockets on the relay. */
export const closeSessionsJob = 'relay.close-sessions'

/** Bumped whenever the objects below change, so the next migration writes them again. */
export const sessionsVersion = 1
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

/** Whether the trigger stands on the sessions table, with the function of this version. Only reads the catalogue. */
export const sessionsCurrent = async (db: Db, sessions: string) => {
  const { rows } = await sql<{ found: boolean }>`select exists (
      select from pg_trigger t join pg_proc p on p.oid = t.tgfoid
      where t.tgrelid = to_regclass(${sessions}) and t.tgname = ${triggerName} and obj_description(p.oid, 'pg_proc') = ${sessionsComment}
    ) as found`.execute(db)
  return rows[0]!.found
}
