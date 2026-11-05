import { sql } from 'kysely'
import type { Db } from '@protobase/query'
import type { WebhookItem } from '@protobase/workflows/plugin'
import { startWorkflow } from '../start-workflow'
import type { HookTarget } from './hook-store'

// The trigger the call found, still running on its workflow's enabled version, both rows locked until the runs are in:
// a disable, change or delete in another transaction waits for them, or went first and left nothing to match.
const stillLive = async (trx: Db, schema: string, target: HookTarget) => {
  const { rows } = await sql`select 1 from ${sql.id(schema, 'triggers')} t
    join ${sql.id(schema, 'workflows')} w on w.id = t.workflow_id and w.enabled_version = t.version
    where t.id = ${target.trigger_id} and t.version = ${target.version} and t.status in ('active', 'failing') for share`.execute(trx)
  return rows.length > 0
}

/**
 * Starts a run per item of a call, in one transaction: only while the trigger the call found still runs on the enabled
 * version, the version and tenant from the trigger row, never from the call, each item's key once per workflow. The
 * first run takes `firstId`, under which the call's large body was kept. The ids of the runs, a run already started
 * for a key included, or `undefined` when the workflow was turned off, changed or deleted since the call found it.
 */
export const startHookRuns = (db: Db, schema: string, target: HookTarget, items: readonly WebhookItem[], firstId: string) =>
  db.transaction().execute(async (trx) => {
    if (!(await stillLive(trx, schema, target))) return
    const ids: string[] = []
    for (const [index, item] of items.entries()) {
      ids.push(
        await startWorkflow(trx, {
          workflow: target.workflow_id,
          version: target.version,
          input: item.data,
          ...(target.tenant_id !== null && { tenant: target.tenant_id }),
          startedBy: `trigger:${target.trigger_id}`,
          ...(item.key !== undefined && { key: item.key }),
          schema,
          ...(index === 0 && { id: firstId }),
        }),
      )
    }
    return ids
  })
