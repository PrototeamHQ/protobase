import { sql } from 'kysely'
import type { Db } from '@protobase/query'
import { hookKey, hookSecret, sha256, type HookMode } from './hook-secrets'

/**
 * Gives the workflow a new URL key and secret, replacing any it had, so its old URL stops at once: the key's SHA-256 is
 * kept, the secret itself only where checking a signature needs it (`standard_webhooks`, `hmac`), and its SHA-256
 * always. The key and secret come back once.
 */
export const saveHook = async (db: Db, schema: string, hook: { workflow: string; tenant: string | null; mode: HookMode; secret?: string }) => {
  const key = hookKey()
  const secret = hookSecret(hook.mode, hook.secret)
  const kept = hook.mode === 'bearer' ? null : secret
  await sql`insert into ${sql.id(schema, 'hooks')} (workflow_id, key_hash, secret, secret_hash, tenant_id)
    values (${hook.workflow}, ${sha256(key)}, ${kept}, ${sha256(secret)}, ${hook.tenant})
    on conflict (workflow_id) do update set key_hash = excluded.key_hash, secret = excluded.secret, secret_hash = excluded.secret_hash, tenant_id = excluded.tenant_id, created_at = now()`.execute(db)
  return { key, secret }
}

/** A live webhook trigger as the route reads it by its URL key. */
export type HookTarget = {
  workflow_id: string
  tenant_id: string | null
  secret: string | null
  secret_hash: string
  trigger_id: string
  version: number
  type: string
  input: Record<string, unknown>
}

/**
 * The webhook trigger a URL key opens, in one statement: the key's workflow in the same tenant, its enabled version's
 * trigger of a webhook type, running or failing. `undefined` for an unknown key, a workflow turned off, deleted or
 * moved to another trigger, and a trigger stopping or waiting for a sign-in, alike.
 */
export const findHook = async (db: Db, schema: string, key: string, webhookTypes: readonly string[]) => {
  const { rows } = await sql<HookTarget>`select h.workflow_id, h.tenant_id, h.secret, h.secret_hash, t.id as trigger_id, t.version, t.type, t.input
    from ${sql.id(schema, 'hooks')} h
    join ${sql.id(schema, 'workflows')} w on w.id = h.workflow_id and w.tenant_id is not distinct from h.tenant_id
    join ${sql.id(schema, 'triggers')} t on t.workflow_id = w.id and t.version = w.enabled_version and t.status in ('active', 'failing') and t.type = any(${webhookTypes})
    where h.key_hash = ${sha256(key)}`.execute(db)
  return rows[0]
}
