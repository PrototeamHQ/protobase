import type { Deps } from '../../deps'
import { fetchReadable } from '../../fetch-readable'
import { deletedRows } from '../../params'
import { requestAccess } from '../../request-access'
import type { Db } from '@protobase/query'
import { mayUpdateWorkflow } from '../may-update-workflow'
import type { SaverRoles } from '../plugin-records'

/**
 * Whether the person who turned a workflow on may still do so: with the roles they hold now in its tenant, they may
 * read this one and update it, as its update row filter and record-level rule decide. Losing either, as when they were
 * demoted or left the organization, withdraws the connection their consent gave its runs.
 */
export const enablerMayUpdate = async (db: Db, deps: Deps, roles: SaverRoles, enabledBy: string, tenant: string | undefined, workflowId: string) => {
  const held = await roles({ id: enabledBy, ...(tenant !== undefined && { tenant }) })
  if (held.length === 0) return false
  const entry = deps.registry.find('workflows')!
  const session = { user: { id: enabledBy, roles: held }, ...(tenant !== undefined && { tenant, organization: { id: tenant } }) }
  const access = await requestAccess(deps, entry, session)
  if (!access.resolved.operations.update) return false
  const found = await fetchReadable(db, access, [workflowId], deletedRows(access.full, false), {})
  if (!found) return false
  return mayUpdateWorkflow(db, access, workflowId, found.record)
}
