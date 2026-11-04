import { f } from '../fields'
import { layout as l } from '../layout'
import { resource } from '../resource'
import { view } from '../view'

const runStatuses = ['queued', 'running', 'waiting', 'succeeded', 'failed'] as const
const stepStatuses = ['succeeded', 'retrying', 'caught', 'failed'] as const

/**
 * Workflows: a definition in the States Language with JSONata, checked on every save, each save a new version. A
 * role's wildcard such as `*.read` reaches none of the workflow resources: their runs read and send data as the
 * definition says, so each is granted on its own.
 */
const workflowsResource = (schema: string) =>
  resource('workflows')
    .table(`${schema}.workflows`)
    .fields({
      id: f.uuid().readOnly().dbDefault(),
      name: f.text().min(1).max(100).filterable().sortable(),
      description: f.text().optional().max(2000),
      definition: f.json(),
      version: f.integer().optional().readOnly(),
      saved_by: f.text().optional().readOnly(),
      tenant_id: f.text().optional().readOnly(),
      created_at: f.timestamp().readOnly().dbDefault(),
      updated_at: f.timestamp().readOnly().dbDefault().sortable(),
    })
    .primaryKey((r) => r.id)
    .tenant((r) => r.tenant_id)
    .search((r) => [r.name])
    .explicitGrants()

const workflowsView = view<ReturnType<typeof workflowsResource>>('workflows')
  .names({ singular: 'Workflow', plural: 'Workflows' })
  .icon('workflow')
  .title((r) => r.name)
  .help('Steps that run one after another along their edges, written in the States Language with JSONata expressions. Each save is a new version; a run keeps the version it started on.')
  .fields((r) => ({ definition: r.definition.help('The States Language with JSONata, every value read by name: the run\'s input as $trigger, an earlier result by the variable a state assigned'), saved_by: r.saved_by.label('Saved by'), updated_at: r.updated_at.label('Updated') }))
  .list((r) => ({ columns: [r.name, r.version, r.updated_at], sort: [[r.updated_at, 'desc']] }))
  .layout((r) => [
    l.section('Workflow', [r.name, r.description, r.definition]),
    l.sidebar([r.version, r.saved_by, r.created_at, r.updated_at]),
    l.related('Runs', { resource: 'workflow_runs', field: 'workflow_id', columns: ['status', 'version', 'created_at', 'duration_ms', 'error'] }),
    l.related('Versions', { resource: 'workflow_versions', field: 'workflow_id', columns: ['version', 'saved_by', 'saved_at'] }),
  ])

/** Each version of a workflow's definition, as it was saved. */
const versionsResource = (schema: string) =>
  resource('workflow_versions')
    .table(`${schema}.versions`)
    .fields({
      workflow_id: f.relation('workflows').readOnly().filterable(),
      version: f.integer().readOnly().sortable(),
      definition: f.json().readOnly(),
      saved_by: f.text().optional().readOnly(),
      tenant_id: f.text().optional().readOnly(),
      saved_at: f.timestamp().readOnly().dbDefault(),
    })
    .primaryKey((r) => [r.workflow_id, r.version])
    .tenant((r) => r.tenant_id)
    .explicitGrants()
    .access({ create: () => false, update: () => false, delete: () => false })

const versionsView = view<ReturnType<typeof versionsResource>>('workflow_versions')
  .names({ singular: 'Workflow version', plural: 'Workflow versions' })
  .icon('history')
  .title((r) => r.version)
  .fields((r) => ({ saved_by: r.saved_by.label('Saved by'), saved_at: r.saved_at.label('Saved') }))
  .list((r) => ({ columns: [r.workflow_id, r.version, r.saved_by, r.saved_at], sort: [[r.version, 'desc']] }))

/** A run of a workflow, started by creating it with its input: it runs the version its workflow has then. */
const runsResource = (schema: string) =>
  resource('workflow_runs')
    .table(`${schema}.runs`)
    .fields({
      id: f.uuid().readOnly().dbDefault(),
      workflow_id: f.relation('workflows').filterable(),
      version: f.integer().optional().readOnly(),
      input: f.json().optional(),
      key: f.text().optional().max(200),
      status: f.enum(runStatuses).readOnly().dbDefault().filterable(),
      output: f.json().optional().readOnly(),
      error: f.text().optional().readOnly(),
      cause: f.text().optional().readOnly(),
      resume_at: f.timestamp().optional().readOnly(),
      started_by: f.text().optional().readOnly(),
      tenant_id: f.text().optional().readOnly(),
      created_at: f.timestamp().readOnly().dbDefault().sortable(),
      finished_at: f.timestamp().optional().readOnly(),
      duration_ms: f.bigint().optional().readOnly(),
    })
    .primaryKey((r) => r.id)
    .tenant((r) => r.tenant_id)
    .explicitGrants()
    .access({ update: () => false, delete: () => false })

const runsView = view<ReturnType<typeof runsResource>>('workflow_runs')
  .names({ singular: 'Workflow run', plural: 'Workflow runs' })
  .icon('play')
  .title((r) => r.created_at)
  .help('A run of a workflow with its input. It takes up where it stands after a restart; each of its steps is listed with what it read, gave and logged.')
  .fields((r) => ({
    workflow_id: r.workflow_id.label('Workflow'),
    input: r.input.help('Read by every state as $trigger'),
    key: r.key.help('A workflow runs once per key, such as the record a trigger found ready'),
    status: r.status.valueLabels({ queued: 'Queued', running: 'Running', waiting: 'Waiting', succeeded: 'Succeeded', failed: 'Failed' }).valueColors({ succeeded: 'green', failed: 'red' }),
    resume_at: r.resume_at.label('Goes on at'),
    started_by: r.started_by.label('Started by'),
    created_at: r.created_at.label('Started'),
    finished_at: r.finished_at.label('Finished'),
    duration_ms: r.duration_ms.label('Duration (ms)'),
  }))
  .list((r) => ({ columns: [r.created_at, r.workflow_id, r.status, r.duration_ms, r.error], sort: [[r.created_at, 'desc']] }))
  .layout((r) => [
    l.section('Run', [r.workflow_id, r.input, r.output, r.error, r.cause]),
    l.sidebar([r.status, r.version, r.started_by, r.created_at, r.resume_at, r.finished_at, r.duration_ms]),
    l.related('Steps', { resource: 'workflow_steps', field: 'run_id', columns: ['scope', 'seq', 'state', 'status', 'attempt', 'duration_ms', 'error'] }),
  ])

/** Every step of every run: its input with secrets redacted, output, variables, logs, timing, try and error. */
const stepsResource = (schema: string) =>
  resource('workflow_steps')
    .table(`${schema}.steps`)
    .fields({
      id: f.bigint().readOnly(),
      run_id: f.relation('workflow_runs').readOnly().filterable(),
      tenant_id: f.text().optional().readOnly(),
      scope: f.text().readOnly(),
      seq: f.integer().readOnly(),
      state: f.text().readOnly().filterable(),
      type: f.text().readOnly(),
      status: f.enum(stepStatuses).readOnly().filterable(),
      attempt: f.integer().readOnly(),
      input: f.json().optional().readOnly(),
      output: f.json().optional().readOnly(),
      assigned: f.json().optional().readOnly(),
      next: f.text().optional().readOnly(),
      resume_at: f.timestamp().optional().readOnly(),
      error: f.text().optional().readOnly(),
      cause: f.text().optional().readOnly(),
      logs: f.json().readOnly(),
      started_at: f.timestamp().readOnly(),
      finished_at: f.timestamp().readOnly(),
      duration_ms: f.bigint().optional().readOnly(),
    })
    .primaryKey((r) => r.id)
    .tenant((r) => r.tenant_id)
    .explicitGrants()
    .access({ create: () => false, update: () => false, delete: () => false })

const stepsView = view<ReturnType<typeof stepsResource>>('workflow_steps')
  .names({ singular: 'Workflow step', plural: 'Workflow steps' })
  .icon('list-checks')
  .title((r) => r.state)
  .fields((r) => ({
    run_id: r.run_id.label('Run'),
    scope: r.scope.help('Where the step ran: empty for the run itself, or the Map item or Parallel branch, such as Each.3[0]').format('code'),
    seq: r.seq.label('Step'),
    attempt: r.attempt.label('Try'),
    status: r.status.valueLabels({ succeeded: 'Succeeded', retrying: 'Retried', caught: 'Caught', failed: 'Failed' }).valueColors({ succeeded: 'green', failed: 'red' }),
    input: r.input.help('Fields whose name says they hold a secret, such as Authorization, are redacted'),
    assigned: r.assigned.label('Variables assigned'),
    next: r.next.label('Goes on to'),
    resume_at: r.resume_at.label('Next state not before'),
    duration_ms: r.duration_ms.label('Duration (ms)'),
  }))
  .list((r) => ({ columns: [r.run_id, r.scope, r.seq, r.state, r.status, r.attempt, r.duration_ms, r.error], sort: [[r.id, 'asc']] }))
  .layout((r) => [
    l.section('Step', [r.run_id, r.state, r.type, r.scope, r.seq, r.input, r.output, r.assigned, r.logs, r.error, r.cause]),
    l.sidebar([r.status, r.attempt, r.next, r.resume_at, r.started_at, r.finished_at, r.duration_ms]),
  ])

/**
 * The resources and views `workflows` adds to an app, over the tables of `schema`: Workflows with their versions, runs
 * and steps. Config only; the server checks and runs them.
 */
export const workflowResources = (schema: string) => ({
  workflows: workflowsResource(schema),
  workflowsView,
  workflowVersions: versionsResource(schema),
  workflowVersionsView: versionsView,
  workflowRuns: runsResource(schema),
  workflowRunsView: runsView,
  workflowSteps: stepsResource(schema),
  workflowStepsView: stepsView,
})
