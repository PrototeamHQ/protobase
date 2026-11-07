import type { ReactNode } from 'react'
import { heldBackLog } from '@protobase/workflows'
import { formatDateTime } from '../../../format/date'
import { formatTag } from '../../../locale/active-locale'
import { Badge } from '../../../primitives/badge'
import { AppLink } from '../../use-app-address'
import { JsonBlock } from '../json/json-block'
import { nodeStatusLabel } from '../workflow/labels'
import { nodeTones, type NodeStatus } from '../workflow/node-trace'
import { scopeItems } from './run-trace'
import { text } from './messages'

/** A step as the run's page reads it, every field the API gives. */
export type StepRow = Record<string, unknown> & { id: string | number; scope: string; attempt: number; status: Exclude<NodeStatus, 'current'>; started_at: string; finished_at: string; logs: { at: string; message: string }[] | null }

export const Part = ({ title, children }: { title: string; children: ReactNode }) => (
  <div className="grid gap-1">
    <h5 className="text-xs font-medium text-muted-foreground">{title}</h5>
    {children}
  </div>
)


// A log line's time to the second, on the viewer's clock: a step's lines are often within the same minute
const logTime = (at: string) => new Intl.DateTimeFormat(formatTag(), { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(Date.parse(at))

const Logs = ({ logs }: { logs: NonNullable<StepRow['logs']> }) => (
  <ol className="grid gap-0.5 rounded-md bg-muted/60 px-3 py-2 font-mono text-xs">
    {logs.map((line, index) => (
      <li key={index} className="whitespace-pre-wrap break-words">
        <time dateTime={line.at} className="text-muted-foreground">{logTime(line.at)}</time> {line.message}
      </li>
    ))}
  </ol>
)

/**
 * One step of a run: its try, item, status, timing and a link to its own page, then its error, input, output, variables
 * and logs, as the run recorded them, secrets blanked out. A step kept from the run it re-runs says so, and so does one
 * a replay did not send.
 */
export const StepCard = ({ step, runStartedAt }: { step: StepRow; runStartedAt: string }) => {
  const kept = Date.parse(step.finished_at) < Date.parse(runStartedAt)
  const heldBack = step.logs?.some((line) => line.message === heldBackLog) ?? false
  const items = scopeItems(step.scope)
  return (
    <article aria-label={text('stepTry', { attempt: step.attempt })} className="grid gap-3 rounded-lg border bg-background p-3">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1 text-body">
        <span className="font-medium text-foreground">{text('stepTry', { attempt: step.attempt })}</span>
        {items.map((item, index) => (
          <span key={index} className="text-muted-foreground">
            {text('itemOf', { index: item.index + 1, map: item.map })}
          </span>
        ))}
        <Badge tone={nodeTones[step.status]}>{nodeStatusLabel(step.status)}</Badge>
        {kept && <Badge tone="violet">{text('kept')}</Badge>}
        {heldBack && <Badge tone="violet">{text('notSent')}</Badge>}
        <time dateTime={step.started_at} className="text-muted-foreground">{formatDateTime(Date.parse(step.started_at))}</time>
        <span className="tabular-nums text-muted-foreground">{text('duration', { ms: Number(step.duration_ms ?? 0) })}</span>
        <AppLink to={{ kind: 'record', resource: 'workflow_steps', key: String(step.id) }} className="ml-auto font-medium text-primary-text hover:underline">
          {text('openStep')}
        </AppLink>
      </header>
      {step.error != null && (
        <Part title={text('error')}>
          <p className="text-body text-danger-text">
            <span className="font-mono">{String(step.error)}</span>
            {step.cause != null && <span>: {String(step.cause)}</span>}
          </p>
        </Part>
      )}
      {step.input !== undefined && step.input !== null && <Part title={text('input')}><JsonBlock value={step.input} /></Part>}
      {step.output !== undefined && step.output !== null && <Part title={text('output')}><JsonBlock value={step.output} /></Part>}
      {step.assigned != null && <Part title={text('variables')}><JsonBlock value={step.assigned} /></Part>}
      {step.logs && step.logs.length > 0 && <Part title={text('logs')}><Logs logs={step.logs} /></Part>}
    </article>
  )
}
