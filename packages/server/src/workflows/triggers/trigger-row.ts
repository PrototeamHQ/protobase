import { sql } from 'kysely'
import type { Db } from '@protobase/query'

/** A trigger as its jobs read it. */
export type TriggerRow = { id: string; workflow_id: string; version: number; tenant_id: string | null; type: string; input: Record<string, unknown>; generation: number; saved_by: string | null }

/**
 * The trigger with this id while it is running on this generation, with who saved its version: `undefined` once it
 * was changed, stopped or removed, so a job queued for it before then does nothing.
 */
export const currentTrigger = async (db: Db, schema: string, id: string, generation: number) => {
  const { rows } = await sql<TriggerRow>`select t.id, t.workflow_id, t.version, t.tenant_id, t.type, t.input, t.generation, v.saved_by
    from ${sql.id(schema, 'triggers')} t join ${sql.id(schema, 'versions')} v on v.workflow_id = t.workflow_id and v.version = t.version
    where t.id = ${id} and t.generation = ${generation} and t.status in ('active', 'failing')`.execute(db)
  return rows[0]
}

/** The running triggers of these types, which each dispatch of changes reads; the `(status, type)` index serves it. */
export const activeTriggers = async (db: Db, schema: string, types: readonly string[]) =>
  (await sql<Omit<TriggerRow, 'saved_by'>>`select id, workflow_id, version, tenant_id, type, input, generation from ${sql.id(schema, 'triggers')}
    where status = 'active' and type = any(${types})`.execute(db)).rows

/** Marks a trigger failing with an error its owner sees; the message names no secret. */
export const triggerFailed = async (db: Db, schema: string, id: string, generation: number, code: string, message: string) => {
  await sql`update ${sql.id(schema, 'triggers')} set status = 'failing', consecutive_failures = consecutive_failures + 1,
    last_error = ${JSON.stringify({ code, message, at: new Date().toISOString() })}::jsonb, updated_at = now()
    where id = ${id} and generation = ${generation}`.execute(db)
}
