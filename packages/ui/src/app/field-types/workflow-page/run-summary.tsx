import { formatDateTime } from '../../../format/date'
import { MetadataCard } from '../../../record-view'
import { AppLink } from '../../use-app-address'
import { ValueBadge } from '../../value-badge'
import { JsonBlock } from '../json/json-block'
import { Part } from '../workflow-run/step-card'
import type { RunTraceData } from '../workflow-run/use-run-trace'
import { useRunStatus } from './use-run-status'
import { text } from './messages'

const when = (value: unknown) => (value === null || value === undefined ? undefined : formatDateTime(Date.parse(String(value))))

/**
 * The run shown, in the side panel while no step is chosen: its status, timing and who started it, its error, input and
 * output, and a link to its own page with every step listed.
 */
export const RunSummary = ({ trace }: { trace: RunTraceData }) => {
  const status = useRunStatus()
  const { run, stored, id } = trace
  if (!run || !stored || !id) return null
  const rows = [
    { label: text('status'), value: <ValueBadge value={run.status} hints={status.hints}>{status.label(run.status)}</ValueBadge> },
    { label: text('started'), value: when(run.created_at) },
    { label: text('startedBy'), value: run.started_by == null ? undefined : String(run.started_by) },
    { label: text('goesOnAt'), value: when(run.resume_at) },
    { label: text('finished'), value: when(run.finished_at) },
    { label: text('duration'), value: run.duration_ms == null ? undefined : text('durationMs', { ms: Number(run.duration_ms) }) },
  ].flatMap((row) => (row.value === undefined ? [] : [row]))
  return (
    <section aria-label={text('runDetails')} className="grid gap-4">
      <MetadataCard title={text('runDetails')} rows={rows} />
      {run.error != null && (
        <Part title={text('error')}>
          <p className="text-body text-danger-text">
            <span className="font-mono">{String(run.error)}</span>
            {run.cause != null && <span>: {String(run.cause)}</span>}
          </p>
        </Part>
      )}
      {run.input != null && <Part title={text('input')}><JsonBlock value={run.input} /></Part>}
      {run.output != null && <Part title={text('output')}><JsonBlock value={run.output} /></Part>}
      <AppLink to={{ kind: 'record', resource: 'workflow_runs', key: id, standard: true }} className="text-body font-medium text-primary-text hover:underline">
        {text('runPage')}
      </AppLink>
    </section>
  )
}
