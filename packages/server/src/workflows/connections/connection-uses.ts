import { sql } from 'kysely'
import type { AccountUses } from '../../better-auth/connections/connection-events'
import type { Deps } from '../../deps'
import type { SaverRoles } from '../plugin-records'
import { enablerMayUpdate } from './enabler-authority'

export type ConnectionUsesInput = { deps: () => Deps; schema: string; roles: SaverRoles }

type Use = { id: string; name: string; tenant_id: string | null; account: string }

/**
 * The workflows that use a person's accounts: those whose enabled version they turned on and binds one of the
 * accounts in its `connections`, kept only while they may still update the workflow, as a step's token needs.
 */
export const connectionUses = ({ deps, schema, roles }: ConnectionUsesInput) => async (userId: string, accountIds: string[]) => {
  const uses: AccountUses = {}
  if (accountIds.length === 0) return uses
  const db = deps().db
  const { rows } = await sql<Use>`select w.id, w.name, v.tenant_id, c.value as account
    from ${sql.id(schema, 'workflows')} w
    join ${sql.id(schema, 'versions')} v on v.workflow_id = w.id and v.version = w.enabled_version
    cross join lateral jsonb_each_text(coalesce(v.definition -> 'connections', '{}'::jsonb)) c
    where v.enabled_by = ${userId} and c.value in (${sql.join(accountIds)})
    order by w.name, w.id`.execute(db)
  for (const row of rows) {
    if (!(await enablerMayUpdate(db, deps(), roles, userId, row.tenant_id ?? undefined, row.id))) continue
    uses[row.account] = [...(uses[row.account] ?? []), { id: row.id, name: row.name }]
  }
  return uses
}
