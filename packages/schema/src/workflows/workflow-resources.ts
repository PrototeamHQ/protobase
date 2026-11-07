import { f } from '../fields'
import { layout as l } from '../layout'
import { resource } from '../resource'
import { view } from '../view'
import { resolutionsResource, resolutionsView, workflowStatusFields, workflowStatusLabels, workflowStatusTones } from './workflow-status'

const runStatuses = ['queued', 'running', 'waiting', 'succeeded', 'failed'] as const
const stepStatuses = ['succeeded', 'retrying', 'caught', 'failed'] as const

/**
 * Workflows: a trigger and a state machine in the States Language with JSONata, checked on every save, each changed definition a new version. A
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
      definition: f.json().dbDefault(),
      version: f.integer().optional().readOnly(),
      enabled_version: f.integer().optional(),
      tenant_id: f.text().optional().readOnly(),
      created_at: f.timestamp().readOnly().dbDefault(),
      updated_at: f.timestamp().readOnly().dbDefault().sortable(),
      ...workflowStatusFields,
    })
    .primaryKey((r) => r.id)
    .tenant((r) => r.tenant_id)
    // `version` counts definitions: a publish or a new name is a change of the record all the same
    .etagFrom((r) => r.updated_at)
    .search((r) => [r.name])
    .explicitGrants()

const workflowsView = view<ReturnType<typeof workflowsResource>>('workflows')
  .names({ singular: 'Workflow', plural: 'Workflows' })
  .icon('workflow')
  .title((r) => r.name)
  // Every workflow under its entry, with the status of its last runs
  .nav({ recent: { status: 'run_status', tones: workflowStatusTones, orderBy: 'name asc', limit: 20 } })
  .help('Steps that run one after another along their edges, written in the States Language with JSONata expressions. Each save that changes its definition is a new version, which goes live only once it is published; a run keeps the version it started on.')
  .fields((r) => ({
    enabled_version: r.enabled_version.label('Published version').help('The saved version that is live: its trigger starts runs, and so does a start that names no version. Set it to any saved version to publish that version, and clear it to turn the workflow off. A save never changes it.'),
    definition: r.definition
      .help('Its trigger and its steps, drawn as a graph that lays itself out. Every value is read by name: the run\'s input as $states.context.Execution.Input, an earlier result by the variable a state assigned')
      .widget('workflow'),
    updated_at: r.updated_at.label('Updated'),
    run_status: r.run_status.label('Status').valueLabels(workflowStatusLabels).valueColors({ failing: 'red', unresolved: 'amber', healthy: 'green' }).widget('workflow_status'),
    status_run_id: r.status_run_id.label('Status run'),
    status_run_at: r.status_run_at.label('Status run ended'),
    unresolved_failures: r.unresolved_failures.label('Unresolved failures'),
    resolved_at: r.resolved_at.label('Resolved'),
    resolved_by: r.resolved_by.label('Resolved by'),
  }))
  .list((r) => ({ columns: [r.name, r.run_status, r.version, r.updated_at], sort: [[r.updated_at, 'desc']] }))
  .recordWidth('full')
  .layout((r) => [
    l.section('Workflow', [r.run_status, r.name, r.description, r.enabled_version]),
    // Its versions, runs and Test run are chosen above the graph, which spans the page
    l.section('Graph', [r.definition], { width: 'page' }),
    l.sidebar([r.version, r.created_at, r.updated_at]),
    l.related('Trigger', { resource: 'workflow_triggers', field: 'workflow_id', columns: ['type', 'status', 'version', 'last_error', 'updated_at'] }),
    l.related('Runs', { resource: 'workflow_runs', field: 'workflow_id', columns: ['status', 'started_by', 'created_at', 'duration_ms', 'version', 'error'] }),
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
  .nav({ hidden: true })
  .title((r) => r.version)
  .fields((r) => ({ saved_by: r.saved_by.label('Saved by'), saved_at: r.saved_at.label('Saved') }))
  .list((r) => ({ columns: [r.workflow_id, r.version, r.saved_by, r.saved_at], sort: [[r.version, 'desc']] }))

/** A run of a workflow, started by creating it with its input: it runs the version it names, else the published one, or on a workflow that is off the one saved last. */
const runsResource = (schema: string) =>
  resource('workflow_runs')
    .table(`${schema}.runs`)
    .fields({
      id: f.uuid().readOnly().dbDefault(),
      workflow_id: f.relation('workflows').filterable(),
      version: f.integer().optional(),
      input: f.json().optional(),
      key: f.text().optional().max(200),
      status: f.enum(runStatuses).readOnly().dbDefault().filterable(),
      output: f.json().optional().readOnly(),
      error: f.text().optional().readOnly(),
      cause: f.text().optional().readOnly(),
      resume_at: f.timestamp().optional().readOnly(),
      started_by: f.text().optional().readOnly(),
      rerun_of: f.relation('workflow_runs').optional().filterable(),
      rerun_from: f.text().optional().max(200),
      replay: f.boolean().optional(),
      tenant_id: f.text().optional().readOnly(),
      created_at: f.timestamp().readOnly().dbDefault().sortable(),
      finished_at: f.timestamp().optional().readOnly(),
      duration_ms: f.bigint().optional().readOnly(),
    })
    .primaryKey((r) => r.id)
    .tenant((r) => r.tenant_id)
    .author((r) => r.started_by)
    .explicitGrants()
    .access({ update: () => false, delete: () => false })

const runsView = view<ReturnType<typeof runsResource>>('workflow_runs')
  .names({ singular: 'Workflow run', plural: 'Workflow runs' })
  .icon('play')
  .nav({ hidden: true })
  .title((r) => r.created_at)
  // A run is shown on its workflow's graph, on the version it ran on
  .recordOpens({ kind: 'record', resource: 'workflows', key: '{workflow_id}', run: '{id}' })
  .help('A run of a workflow with its input. It takes up where it stands after a restart; each of its steps is listed with what it read, gave and logged.')
  .fields((r) => ({
    id: r.id.label('Steps').widget('workflow_run'),
    workflow_id: r.workflow_id.label('Workflow'),
    input: r.input.widget('json').help('Read by every state as $states.context.Execution.Input; a re-run takes the input of the run it re-runs'),
    rerun_of: r.rerun_of.label('Re-run of').help('A failed run of the workflow: the re-run keeps its steps before the one that failed, and goes on from there on the workflow as it is now; with Replay, a run that ended, run again from the start'),
    rerun_from: r.rerun_from.label('Re-run from').help("With Re-run of, a run that ended: the state of the workflow itself to go on from. The steps before it stay as they ran; it and all after it run again, and what they send goes out again").notOnCreate(),
    replay: r.replay.label('Replay').help("With Re-run of, runs that run again from the start on its version and input: its steps that write, such as mail, record writes and requests other than GET, are not sent and give what they gave then, and its reads are served from the step cache"),
    key: r.key.help('A workflow runs once per key, such as the record a trigger found ready'),
    status: r.status.valueLabels({ queued: 'Queued', running: 'Running', waiting: 'Waiting', succeeded: 'Succeeded', failed: 'Failed' }).valueColors({ succeeded: 'green', failed: 'red' }),
    output: r.output.widget('json'),
    resume_at: r.resume_at.label('Goes on at'),
    started_by: r.started_by.label('Started by'),
    created_at: r.created_at.label('Started'),
    finished_at: r.finished_at.label('Finished'),
    duration_ms: r.duration_ms.label('Duration (ms)'),
  }))
  .list((r) => ({ columns: [r.created_at, r.workflow_id, r.status, r.started_by, r.duration_ms, r.error], sort: [[r.created_at, 'desc']] }))
  .actions((a) => [
    a.link('replay', { label: 'Replay', icon: 'history', to: { kind: 'create', resource: 'workflow_runs', values: { workflow_id: '{workflow_id}', rerun_of: '{id}', replay: 'true' } }, when: 'status = "succeeded" OR status = "failed"' }),
    a.link('rerun', { label: 'Re-run from the failed step', icon: 'restart', to: { kind: 'create', resource: 'workflow_runs', values: { workflow_id: '{workflow_id}', rerun_of: '{id}' } }, when: 'status = "failed"' }),
  ])
  .layout((r) => [
    l.section('Trace', [r.id]),
    l.section('Run', [r.workflow_id, r.input, r.output, r.error, r.cause]),
    l.sidebar([r.status, r.version, r.started_by, r.rerun_of, r.rerun_from, r.replay, r.created_at, r.resume_at, r.finished_at, r.duration_ms]),
    l.related('Steps', { resource: 'workflow_steps', field: 'run_id', columns: ['scope', 'seq', 'state', 'status', 'attempt', 'duration_ms', 'error'] }),
    l.related('Re-runs', { resource: 'workflow_runs', field: 'rerun_of', columns: ['status', 'started_by', 'created_at', 'duration_ms', 'error'] }),
  ])

/** Every step of every run: its input with secrets redacted, output, variables, logs, timing, try and error. */
const stepsResource = (schema: string) =>
  resource('workflow_steps')
    .table(`${schema}.steps`)
    .fields({
      id: f.bigint().readOnly().sortable(),
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
  .nav({ hidden: true })
  .title((r) => r.state)
  .fields((r) => ({
    run_id: r.run_id.label('Run'),
    scope: r.scope.help('Where the step ran: empty for the run itself, or the Map item, such as Each.3[0]').format('code'),
    seq: r.seq.label('Step'),
    attempt: r.attempt.label('Try'),
    status: r.status.valueLabels({ succeeded: 'Succeeded', retrying: 'Retried', caught: 'Caught', failed: 'Failed' }).valueColors({ succeeded: 'green', failed: 'red' }),
    input: r.input.help("The app's secrets, and fields whose name says they hold one such as Authorization, are blanked out"),
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

const triggerStatuses = ['active', 'failing', 'needs_sign_in', 'stopping'] as const

/** The trigger of each enabled workflow, as the engine keeps it: its type, status and last error, never its state. */
const triggersResource = (schema: string) =>
  resource('workflow_triggers')
    .table(`${schema}.triggers`)
    .fields({
      id: f.uuid().readOnly().dbDefault(),
      workflow_id: f.relation('workflows').readOnly().filterable(),
      version: f.integer().readOnly(),
      type: f.text().readOnly(),
      status: f.enum(triggerStatuses).readOnly().filterable(),
      last_error: f.json().optional().readOnly(),
      next_poll_at: f.timestamp().optional().readOnly(),
      tenant_id: f.text().optional().readOnly(),
      updated_at: f.timestamp().readOnly().dbDefault().sortable(),
    })
    .primaryKey((r) => r.id)
    .tenant((r) => r.tenant_id)
    .explicitGrants()
    .access({ create: () => false, update: () => false, delete: () => false })

const triggersView = view<ReturnType<typeof triggersResource>>('workflow_triggers')
  .names({ singular: 'Workflow trigger', plural: 'Workflow triggers' })
  .icon('zap')
  .nav({ hidden: true })
  .title((r) => r.type)
  .fields((r) => ({
    workflow_id: r.workflow_id.label('Workflow'),
    status: r.status.valueLabels({ active: 'Active', failing: 'Failing', needs_sign_in: 'Needs sign-in', stopping: 'Stopping' }).valueColors({ active: 'green', failing: 'red', needs_sign_in: 'amber' }),
    last_error: r.last_error.label('Last error'),
    next_poll_at: r.next_poll_at.label('Next poll'),
    updated_at: r.updated_at.label('Updated'),
  }))
  .list((r) => ({ columns: [r.workflow_id, r.type, r.status, r.updated_at], sort: [[r.updated_at, 'desc']] }))

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
  workflowTriggers: triggersResource(schema),
  workflowTriggersView: triggersView,
  workflowResolutions: resolutionsResource(schema),
  workflowResolutionsView: resolutionsView,
})
