import { formatDateTime } from '../../../format/date'
import { Badge } from '../../../primitives/badge'
import { buttonClass } from '../../../primitives/button'
import { AppLink } from '../../use-app-address'
import type { WorkflowPage } from './use-workflow-page'
import { useRunStatus } from './use-run-status'
import { closedRunAddress, workflowViewAddress, type WorkflowView } from './workflow-view'
import { text } from './messages'

/**
 * What the graph shows when it is not the latest version to edit, in words: the version shown, read-only, and the
 * latest, with a link back to it; or the run shown and the version it ran on, with a link that closes it. Nothing on
 * the latest version.
 */
export const ShownNotice = ({ view, page }: { view: WorkflowView; page: WorkflowPage }) => {
  const status = useRunStatus()
  if (view.run === undefined && view.version === undefined) return null
  const { latest, shown } = page
  const run = page.trace.run
  const toLatest = (
    <AppLink to={workflowViewAddress({ workflow: view.workflow })} className={buttonClass({ size: 'sm' })}>
      {text('backToLatest')}
    </AppLink>
  )
  const message =
    view.run !== undefined
      ? run && shown !== undefined && text('runShown', { when: formatDateTime(Date.parse(String(run.created_at))), status: status.label(run.status), version: shown })
      : shown === latest
        ? text('latestShown', { version: shown ?? 0 })
        : text('olderVersion', { version: shown ?? 0, latest: latest ?? 0 })
  return (
    <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border bg-surface px-3 py-2 text-body">
      <Badge tone="amber">{text('readOnly')}</Badge>
      <span className="min-w-0 flex-1 basis-48">{message}</span>
      <span className="flex flex-wrap gap-2">
        {view.run !== undefined && (
          <AppLink to={closedRunAddress(view, latest)} className={buttonClass({ size: 'sm' })}>
            {text('closeRun')}
          </AppLink>
        )}
        {(view.run === undefined || shown !== latest) && toLatest}
      </span>
    </div>
  )
}
