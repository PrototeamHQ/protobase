import { sql } from 'kysely'
import type { Db } from '@protobase/query'

/** A poll or renewal job as its claim names it: the trigger, its generation, and the job's id and try. */
export type ClaimKey = { trigger: string; generation: number; job: string; attempt: number }

/** What a claimed trigger's poll or renewal works on. */
export type ClaimedTrigger = {
  id: string
  workflow_id: string
  version: number
  tenant_id: string | null
  type: string
  input: Record<string, unknown>
  cursor: unknown
  store: unknown
  connection_id: string | null
  consecutive_failures: number
}

/**
 * Claims the trigger for this try of the job its row names, in one statement: only while it runs on this generation,
 * and only for a later try than the last that claimed it, so a retry of a job whose worker died takes its claim back,
 * and a try that ran past its timeout no longer holds it. `undefined` when the trigger was stopped, changed or moved
 * to another job.
 */
export const claimTrigger = async (db: Db, schema: string, { trigger, generation, job, attempt }: ClaimKey) => {
  const { rows } = await sql<ClaimedTrigger>`update ${sql.id(schema, 'triggers')} set poll_attempt = ${attempt}
    where id = ${trigger} and generation = ${generation} and poll_job_id = ${job} and status in ('active', 'failing')
      and (poll_attempt is null or poll_attempt < ${attempt})
    returning id, workflow_id, version, tenant_id, type, input, cursor, store, connection_id, consecutive_failures`.execute(db)
  return rows[0]
}

// The trigger row while this try holds its claim, locked for the rest of the transaction: a disable or change in
// another transaction waits for it, or went first and left nothing to match.
const held = (schema: string, { trigger, generation, job, attempt }: ClaimKey) =>
  sql`select id, workflow_id, version, tenant_id from ${sql.id(schema, 'triggers')}
    where id = ${trigger} and generation = ${generation} and poll_job_id = ${job} and poll_attempt = ${attempt} and status in ('active', 'failing') for update`

export type TriggerOutcome = { cursor: unknown; store: unknown; nextAt: Date }

/**
 * Saves a successful poll in one statement that locks the trigger row while this try holds its claim: the runs of its
 * items, each once per workflow and key, and the new cursor and store, the trigger active again. The ids of the runs it
 * started, or `undefined` when the claim was gone and nothing was written.
 */
export const savePoll = async (trx: Db, schema: string, claim: ClaimKey, items: readonly { key: string; data: unknown }[], { cursor, store, nextAt }: TriggerOutcome) => {
  const triggers = sql.id(schema, 'triggers')
  const { rows } = await sql<{ saved: number; runs: string[] }>`with t as (${held(schema, claim)}),
    started as (insert into ${sql.id(schema, 'runs')} (workflow_id, version, input, key, tenant_id, started_by)
      select t.workflow_id, t.version, i.data, i.key, t.tenant_id, 'trigger:' || t.id from t cross join jsonb_to_recordset(${JSON.stringify(items)}::jsonb) as i(key text, data jsonb)
      on conflict (workflow_id, key) do nothing returning id),
    saved as (update ${triggers} set cursor = ${JSON.stringify(cursor ?? null)}::jsonb, store = ${JSON.stringify(store ?? null)}::jsonb, status = 'active',
      consecutive_failures = 0, last_error = null, poll_attempt = null, next_poll_at = ${nextAt}, updated_at = now() from t where ${triggers}.id = t.id returning 1)
    select (select count(*) from saved)::int as saved, coalesce((select json_agg(id) from started), '[]'::json) as runs`.execute(trx)
  const row = rows[0]!
  return row.saved > 0 ? row.runs : undefined
}

/** Saves a renewal's state while this try holds its claim; whether it did. */
export const saveRenewal = async (trx: Db, schema: string, claim: ClaimKey, { store, nextAt }: Omit<TriggerOutcome, 'cursor'>) => {
  const triggers = sql.id(schema, 'triggers')
  const { rows } = await sql`with t as (${held(schema, claim)})
    update ${triggers} set store = ${JSON.stringify(store ?? null)}::jsonb, status = 'active', consecutive_failures = 0, last_error = null, poll_attempt = null,
      next_poll_at = ${nextAt}, updated_at = now() from t where ${triggers}.id = t.id returning 1`.execute(trx)
  return rows.length > 0
}

/** Marks the trigger failing with the plugin's error, while this try holds its claim; whether it did. */
export const savePluginFailure = async (trx: Db, schema: string, claim: ClaimKey, message: string, nextAt: Date) => {
  const triggers = sql.id(schema, 'triggers')
  const error = JSON.stringify({ code: 'plugin_error', message, at: new Date().toISOString() })
  const { rows } = await sql`with t as (${held(schema, claim)})
    update ${triggers} set status = 'failing', consecutive_failures = consecutive_failures + 1, last_error = ${error}::jsonb, poll_attempt = null,
      next_poll_at = ${nextAt}, updated_at = now() from t where ${triggers}.id = t.id returning 1`.execute(trx)
  return rows.length > 0
}

/** Names the job that polls or renews the trigger next, on the row the transaction holds locked. */
export const setNextJob = async (trx: Db, schema: string, trigger: string, job: string) => {
  await sql`update ${sql.id(schema, 'triggers')} set poll_job_id = ${job} where id = ${trigger}`.execute(trx)
}

/**
 * The connection's sign-in expired: this trigger, while this try holds its claim, and every running trigger of the same
 * tenant on the same connection wait for a new sign-in, with no next poll. A trigger without a connection is the only
 * one it moves.
 */
export const saveNeedsSignIn = async (db: Db, schema: string, claim: ClaimKey, trigger: Pick<ClaimedTrigger, 'connection_id' | 'tenant_id'>, message: string) => {
  const error = JSON.stringify({ code: 'link_expired', message, at: new Date().toISOString() })
  const { trigger: id, generation, job, attempt } = claim
  await sql`update ${sql.id(schema, 'triggers')} set status = 'needs_sign_in', last_error = ${error}::jsonb, poll_job_id = null, poll_attempt = null, next_poll_at = null, updated_at = now()
    where status in ('active', 'failing') and (
      (id = ${id} and generation = ${generation} and poll_job_id = ${job} and poll_attempt = ${attempt})
      or (${trigger.connection_id}::text is not null and connection_id = ${trigger.connection_id} and tenant_id is not distinct from ${trigger.tenant_id}))`.execute(db)
}
