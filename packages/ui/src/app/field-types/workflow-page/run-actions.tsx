import { ActionRail, type RailAction } from '../../../record-view'
import { RouteLink } from '../../../primitives/route-link'
import { actionIcon } from '../../action-icon'
import { useAdminMeta, usePermissions } from '../../meta-gate'
import { actionLink } from '../../pages/action-link'
import { actionApplies } from '../../pages/action-when'
import { can } from '../../permissions'
import { useAppAddress } from '../../use-app-address'
import type { RunTraceData } from '../workflow-run/use-run-trace'

/**
 * The run shown's own link actions, as its view names them, such as Re-run and Replay, in the side panel whatever step
 * is chosen: each a link to the form of the new run it starts, to someone who may start runs.
 */
export const RunActions = ({ trace }: { trace: RunTraceData }) => {
  const app = useAppAddress()
  const view = useAdminMeta().views.workflow_runs
  const mayRun = can(usePermissions('workflow_runs'), 'create')
  const record = trace.run
  if (!view || !record || !mayRun) return null
  const actions = view.actions.flatMap((action): RailAction[] => {
    if (action.run?.kind !== 'link' || !actionApplies(action, record)) return []
    const link = actionLink(action.run, record, app)
    return [{ name: action.label, icon: actionIcon(action.icon), render: ({ className, children, role }) => <RouteLink to={link} role={role} className={className}>{children}</RouteLink> }]
  })
  return actions.length === 0 ? null : <ActionRail actions={actions} />
}
