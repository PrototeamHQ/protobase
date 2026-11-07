import type { StatusTone } from '@protobase/schema'
import { resolvableStatuses, statusRuns, workflowStatuses, workflowStatusTones, type WorkflowStatus } from '@protobase/schema/internal'
import { formatDateTime } from '../../../format/date'
import { text } from './messages'

/** What a workflow's page says of its status: its tone, the words, the run they name when they name one, and whether it can be marked resolved. */
export type StatusReason = { status: WorkflowStatus; tone: StatusTone; words: string; run?: string; resolvable: boolean }

const isStatus = (value: unknown): value is WorkflowStatus => (workflowStatuses as readonly unknown[]).includes(value)

const when = (value: unknown) => formatDateTime(Date.parse(String(value)))

/** The reason of a workflow's status, from its record's status fields; none for a record without a status, as for a caller who cannot read its runs. */
export const statusReason = (record: Record<string, unknown>): StatusReason | undefined => {
  const status = record.run_status
  if (!isStatus(status)) return
  const shared = { status, tone: (workflowStatusTones as Partial<Record<WorkflowStatus, StatusTone>>)[status] ?? 'neutral', resolvable: resolvableStatuses.includes(status) }
  const run = record.status_run_id == null ? undefined : String(record.status_run_id)
  if (status === 'failing' || status === 'healthy') return { ...shared, words: text(status, { when: when(record.status_run_at), runs: statusRuns }), ...(run && { run }) }
  if (status === 'unresolved') return { ...shared, words: text(status, { count: Number(record.unresolved_failures), runs: statusRuns, when: when(record.status_run_at) }), ...(run && { run }) }
  return { ...shared, words: text(status) }
}
