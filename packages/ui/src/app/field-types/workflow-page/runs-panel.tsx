import { useState } from 'react'
import { FocusPanel } from '../../../focus-page'
import { formatDateTime } from '../../../format/date'
import { Button } from '../../../primitives/button'
import { Segmented } from '../../../primitives/segmented'
import { AppLink } from '../../use-app-address'
import { ValueBadge } from '../../value-badge'
import type { WorkflowPage } from './use-workflow-page'
import { useRunStatus } from './use-run-status'
import { runAddress, type WorkflowView } from './workflow-view'
import { text } from './messages'

type Filter = 'all' | 'failed'

// Seconds from a second up, to one decimal: what a person reads a run's length in
const runTime = (ms: number) => (ms < 1000 ? text('durationMs', { ms }) : text('durationSeconds', { seconds: Math.round(ms / 100) / 10 }))

const preview = (input: unknown) => (input == null ? undefined : JSON.stringify(input))

/** The workflow's latest runs in the end panel, each a link that shows it on the graph, with its status, time, version, how long it took and how it started. */
export const RunsPanel = ({ view, page, onTestRun, onClose }: { view: WorkflowView; page: WorkflowPage; onTestRun?: (() => void) | undefined; onClose: () => void }) => {
  const [filter, setFilter] = useState<Filter>('all')
  const status = useRunStatus()
  const runs = page.runs.filter((run) => filter === 'all' || run.status === 'failed')
  return (
    <FocusPanel title={text('runs')} onClose={onClose} takesFocus>
      <div className="flex flex-col gap-3">
        <Segmented<Filter> value={filter} label={text('runs')} options={[{ value: 'all', label: text('filterAll') }, { value: 'failed', label: text('filterFailed') }]} onChange={setFilter} />
        {page.runs.length === 0 && (
          <div className="grid gap-2 justify-items-start">
            <p className="text-body text-muted-foreground">{text('noRuns')}</p>
            {onTestRun && <Button onClick={onTestRun}>{text('testRun')}</Button>}
          </div>
        )}
        <ul className="grid gap-1">
          {runs.map((run) => (
            <li key={String(run.id)}>
              <AppLink to={runAddress(view.workflow, String(run.id), Number(run.version), page.latest)} aria-current={view.run === run.id ? 'true' : undefined} onClick={onClose} className="grid gap-0.5 rounded-md px-2 py-2 hover:bg-muted aria-[current]:bg-muted max-md:min-h-11">
                <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                  <ValueBadge value={run.status} hints={status.hints}>{status.label(run.status)}</ValueBadge>
                  <span className="font-medium text-foreground">{formatDateTime(Date.parse(String(run.created_at)))}</span>
                  <span>{text('versionShort', { version: Number(run.version) })}</span>
                  {run.duration_ms != null && <span className="tabular-nums">{runTime(Number(run.duration_ms))}</span>}
                  <span>{run.started_by == null ? text('startedByTrigger') : text('startedByTest')}</span>
                </span>
                {preview(run.input) && <span className="truncate font-mono text-xs text-muted-foreground">{preview(run.input)}</span>}
              </AppLink>
            </li>
          ))}
        </ul>
      </div>
    </FocusPanel>
  )
}
