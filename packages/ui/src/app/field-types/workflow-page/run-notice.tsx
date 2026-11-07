import { FocusNotice } from '../../../focus-page'
import { formatDateTime } from '../../../format/date'
import { Button, buttonClass } from '../../../primitives/button'
import { AppLink } from '../../use-app-address'
import type { WorkflowPage } from './use-workflow-page'
import { closedRunAddress, workflowViewAddress, type WorkflowView } from './workflow-view'
import { text } from './messages'

export type RunNoticeProps = {
  view: WorkflowView
  page: WorkflowPage
  /** The step that failed in the run, shown on the graph. */
  failed: string | undefined
  /** Unsaved changes are on the graph. */
  changed: boolean
  /** How many steps of the run the version shown no longer has. */
  gone: number
  onOpenFailed?: (() => void) | undefined
}

/**
 * What the graph shows when it is not simply the latest version, one line in the page's notice: the run shown, whose
 * marks stay on the graph while the latest version is edited, or an older version, read-only, with the way back.
 */
export const RunNotice = ({ view, page, failed, changed, gone, onOpenFailed }: RunNoticeProps) => {
  const { latest, trace } = page
  const run = trace.run
  const older = view.version !== undefined && view.version !== latest
  const toLatest = workflowViewAddress({ workflow: view.workflow, ...(view.run && { run: view.run }) })
  const edit = <AppLink to={toLatest} className={buttonClass({ size: 'sm' })}>{text('editLatest')}</AppLink>
  const hide = <AppLink to={closedRunAddress(view, latest)} className={buttonClass({ size: 'sm' })}>{text('hideRun')}</AppLink>
  if (view.run === undefined) {
    if (!older) return null
    return <FocusNotice level="info" actions={edit}>{text('olderVersion', { version: view.version ?? 0, latest: latest ?? 0 })}{page.enabled !== undefined && ` ${text('versionIsLive', { version: page.enabled })}`}</FocusNotice>
  }
  if (!run) return null
  const when = formatDateTime(Date.parse(String(run.created_at)))
  const version = Number(run.version)
  const message = () => {
    if (older) return text('runOlder', { when, version: view.version ?? 0, latest: latest ?? 0 })
    if (changed) return text('runChanged', { when, version })
    if (version !== latest) return text('runUsed', { when, version, latest: latest ?? 0 })
    return failed ? text('runFailedAt', { when, step: failed, version }) : text('runSame', { when, version })
  }
  return (
    <FocusNotice
      level="info"
      actions={
        <>
          {failed && onOpenFailed && <Button size="sm" onClick={onOpenFailed}>{text('openFailed')}</Button>}
          {older && edit}
          {hide}
        </>
      }
    >
      {message()}
      {gone > 0 && <span className="text-muted-foreground"> {text('stepsGone', { count: gone })}</span>}
    </FocusNotice>
  )
}
