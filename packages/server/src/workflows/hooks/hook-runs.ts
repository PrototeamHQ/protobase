import type { Db } from '@protobase/query'
import type { WebhookItem } from '@protobase/workflows/plugin'
import { startWorkflow } from '../start-workflow'
import type { HookTarget } from './hook-store'

/**
 * Starts a run per item of a call, in one transaction: the enabled version and tenant from the trigger row, never from
 * the call, each item's key once per workflow. The first run takes `firstId`, under which the call's large body was
 * kept. The ids of the runs, a run already started for a key included.
 */
export const startHookRuns = (db: Db, schema: string, target: HookTarget, items: readonly WebhookItem[], firstId: string) =>
  db.transaction().execute(async (trx) => {
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
