import type { FieldAccess } from '../access/types'
import { f } from '../fields'
import type { StatusTone } from '../model'
import { resource } from '../resource'
import { view } from '../view'

/** How many of a workflow's latest ended runs its status reads. */
export const statusRuns = 10

/**
 * A workflow's status from its last {@link statusRuns} ended runs, as its database triggers keep it: `failing` when the
 * latest failed and still counts, `unresolved` when it succeeded and an earlier one failed and still counts, `healthy`
 * when none counts; `no_runs`, `resolved` and `new_version` when there is no ended run, or the latest is a failure that
 * stopped counting as someone marked the workflow resolved or saved a new version.
 */
export const workflowStatuses = ['failing', 'unresolved', 'healthy', 'no_runs', 'resolved', 'new_version'] as const

export type WorkflowStatus = (typeof workflowStatuses)[number]

/** What each status is called, in the sidebar's names for screen readers and on the workflow's page. */
export const workflowStatusLabels = {
  failing: 'Last run failed',
  unresolved: 'Earlier failure unresolved',
  healthy: 'No unresolved failures',
  no_runs: 'No runs yet',
  resolved: 'No runs since resolved',
  new_version: 'No runs since this version',
} as const satisfies Record<WorkflowStatus, string>

/** The sidebar's tone for each status; the gray ones are `neutral`. */
export const workflowStatusTones = { failing: 'danger', unresolved: 'warning', healthy: 'success' } as const satisfies Partial<Record<WorkflowStatus, StatusTone>>

/** The statuses "Mark as resolved" clears. */
export const resolvableStatuses: readonly WorkflowStatus[] = ['failing', 'unresolved']

// The status tells how runs went, so only a caller who reads every run of the workflow sees it.
const readsRuns: FieldAccess = { read: (ctx) => ctx.holds?.('workflow_runs.read') ?? false }

/**
 * The status fields of a workflow, all written by the database: the status, the run its reason links to and when it
 * ended, how many failures among the last runs still count, and who last marked it resolved and when.
 */
export const workflowStatusFields = {
  run_status: f.enum(workflowStatuses).readOnly().dbDefault().access(readsRuns),
  status_run_id: f.relation('workflow_runs').optional().readOnly().access(readsRuns),
  status_run_at: f.timestamp().optional().readOnly().access(readsRuns),
  unresolved_failures: f.integer().readOnly().dbDefault().access(readsRuns),
  resolved_at: f.timestamp().optional().readOnly(),
  resolved_by: f.text().optional().readOnly(),
}

/**
 * Each time someone marked a workflow resolved: kept, never changed, and copied onto the workflow. Whoever may change
 * the workflow may mark it, naming the workflow without reading these records, which take `workflow_resolutions.read`.
 */
export const resolutionsResource = (schema: string) =>
  resource('workflow_resolutions')
    .table(`${schema}.resolutions`)
    .fields({
      id: f.uuid().readOnly().dbDefault(),
      workflow_id: f.relation('workflows').filterable().access({ create: () => true }),
      resolved_by: f.text().optional().readOnly(),
      tenant_id: f.text().optional().readOnly(),
      resolved_at: f.timestamp().readOnly().dbDefault().sortable(),
    })
    .primaryKey((r) => r.id)
    .tenant((r) => r.tenant_id)
    .author((r) => r.resolved_by)
    .parent((r) => r.workflow_id, 'update')
    .explicitGrants()
    .access({ create: () => true, update: () => false, delete: () => false })

export const resolutionsView = view<ReturnType<typeof resolutionsResource>>('workflow_resolutions')
  .names({ singular: 'Workflow resolution', plural: 'Workflow resolutions' })
  .icon('check')
  .nav({ hidden: true })
  .title((r) => r.resolved_at)
  .fields((r) => ({ workflow_id: r.workflow_id.label('Workflow'), resolved_by: r.resolved_by.label('Resolved by'), resolved_at: r.resolved_at.label('Resolved') }))
  .list((r) => ({ columns: [r.workflow_id, r.resolved_by, r.resolved_at], sort: [[r.resolved_at, 'desc']] }))
