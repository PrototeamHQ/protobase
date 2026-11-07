import { FocusPanel } from '../../../focus-page'
import { formatDateTime } from '../../../format/date'
import { Button } from '../../../primitives/button'
import { MetadataCard } from '../../../record-view'
import { AppLink } from '../../use-app-address'
import { ValueBadge } from '../../value-badge'
import { JsonBlock } from '../json/json-block'
import { Part, type ValueActions } from '../workflow-run/step-card'
import type { RunTraceData } from '../workflow-run/use-run-trace'
import { useRunStatus } from './use-run-status'
import { text } from './messages'

const when = (value: unknown) => (value === null || value === undefined ? undefined : formatDateTime(Date.parse(String(value))))

export type RunSidePanelProps = {
  trace: RunTraceData
  valueActions: ValueActions
  /** Replays the run; none while it goes on or to someone who may not start runs. */
  onReplay: (() => void) | undefined
  onClose: () => void
}

/** The run shown in the end panel while no step is chosen: how it did, its error, input and output, Replay, and a link to its own page. */
export const RunSidePanel = ({ trace, valueActions, onReplay, onClose }: RunSidePanelProps) => {
  const status = useRunStatus()
  const { run, id } = trace
  if (!run || !id) return null
  const rows = [
    { label: text('status'), value: <ValueBadge value={run.status} hints={status.hints}>{status.label(run.status)}</ValueBadge> },
    { label: text('started'), value: when(run.created_at) },
    { label: text('startedBy'), value: run.started_by == null ? undefined : String(run.started_by) },
    { label: text('goesOnAt'), value: when(run.resume_at) },
    { label: text('finished'), value: when(run.finished_at) },
    { label: text('duration'), value: run.duration_ms == null ? undefined : text('durationMs', { ms: Number(run.duration_ms) }) },
  ].flatMap((row) => (row.value === undefined ? [] : [row]))
  return (
    <FocusPanel title={text('runDetails')} onClose={onClose} {...(onReplay && { footer: <Button className="w-full max-md:min-h-11" onClick={onReplay}>{text('replay')}</Button> })}>
      <div className="grid gap-4">
        <MetadataCard title={text('runDetails')} rows={rows} />
        {run.error != null && (
          <Part title={text('error')}>
            <p className="text-body text-danger-text">
              <span className="font-mono">{String(run.error)}</span>
              {run.cause != null && <span>: {String(run.cause)}</span>}
            </p>
          </Part>
        )}
        {run.input != null && <Part title={text('input')}><JsonBlock value={run.input} />{valueActions(run.input, 'input')}</Part>}
        {run.output != null && <Part title={text('output')}><JsonBlock value={run.output} />{valueActions(run.output, 'output')}</Part>}
        <AppLink to={{ kind: 'record', resource: 'workflow_runs', key: id, standard: true }} className="text-body font-medium text-primary-text hover:underline">
          {text('runPage')}
        </AppLink>
      </div>
    </FocusPanel>
  )
}
