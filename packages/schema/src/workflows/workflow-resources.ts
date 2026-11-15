import { f } from '../fields'
import { layout as l } from '../layout'
import { resource } from '../resource'
import { view } from '../view'
import { storageConfigurationResources } from './storage-configurations'
import { customStepResources } from './custom-steps'
import { runnerResources } from './runners'
import { resolutionsResource, resolutionsView, workflowStatusFields, workflowStatusLabels, workflowStatusTones } from './workflow-status'

const runStatuses = ['queued', 'running', 'waiting', 'succeeded', 'failed'] as const
const traceModes = ['all', 'failed', 'none'] as const
const executionOrders = ['sequence', 'data'] as const

// A workflow's definition, in fields of their own, as a workflow and each of its versions keep it: the state machine in
// the States Language (in sequence order exactly as Step Functions takes and gives it), what starts its runs, the order
// its states run in, the account each of its connections signs in with, and which of its runs keep a trace.
const definitionFields = {
  state_machine: f.json().dbDefault(),
  trigger: f.json().dbDefault(),
  execution_order: f.enum(executionOrders).dbDefault().filterable(),
  connections: f.json().optional(),
  trace: f.enum(traceModes).optional(),
}

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
      ...definitionFields,
      layout: f.json().dbDefault(),
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
    description: r.description.notOnCreate(),
    enabled_version: r.enabled_version.label('Published version').help('The saved version that is live: its trigger starts runs, and so does a start that names no version. Set it to any saved version to publish that version, and clear it to turn the workflow off. A save never changes it.').notOnCreate(),
    state_machine: r.state_machine
      .label('Steps')
      .help('Its trigger and its steps, drawn as a graph that lays itself out. Every value is read by name: the run\'s input as $states.context.Execution.Input, an earlier result by the variable a state assigned')
      .widget('workflow')
      .notOnCreate(),
    execution_order: r.execution_order
      .label('Execution order')
      .valueLabels({ sequence: 'In sequence', data: 'From the data' })
      .help('In sequence, each step names the one after it, as the States Language has it. From the data, a step runs once the steps it reads from have ended, and steps that read nothing of each other run at once.')
      .notOnCreate(),
    trigger: r.trigger.notOnCreate(),
    connections: r.connections.notOnCreate(),
    trace: r.trace.label('Traces').valueLabels({ all: 'Every run', failed: 'Failed runs', none: 'None' }).notOnCreate(),
    layout: r.layout.label('Layout').help('Where nodes of the graph were moved by hand, by the state each is of; the graph lays out the others. A change to it alone makes no new version.').notOnCreate(),
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
  // The graph is the page; the name, the Trigger, Runs and Versions tables are on the form, a link away
  .record((r) => ({ surface: r.state_machine }))
  .layout((r) => [
    l.section('Workflow', [r.run_status, r.name, r.description, r.enabled_version]),
    l.sidebar([r.version, r.created_at, r.updated_at]),
    l.related('Trigger', { resource: 'workflow_triggers', field: 'workflow_id', columns: ['type', 'status', 'version', 'last_error', 'updated_at'] }),
    l.related('Runs', { resource: 'workflow_runs', field: 'workflow_id', filter: 'isNull(block_of)', columns: ['status', 'started_by', 'created_at', 'duration_ms', 'version', 'error'] }),
    l.related('Versions', { resource: 'workflow_versions', field: 'workflow_id', columns: ['version', 'saved_by', 'saved_at'] }),
  ])

/** Each version of a workflow's definition, as it was saved, with where its nodes were moved then. */
const versionsResource = (schema: string) =>
  resource('workflow_versions')
    .table(`${schema}.versions`)
    .fields({
      workflow_id: f.relation('workflows').readOnly().filterable(),
      version: f.integer().readOnly().sortable(),
      state_machine: f.json().readOnly(),
      trigger: f.json().readOnly(),
      execution_order: f.enum(executionOrders).readOnly(),
      connections: f.json().optional().readOnly(),
      trace: f.enum(traceModes).optional().readOnly(),
      layout: f.json().readOnly(),
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

/**
 * A run of a workflow, started by creating it with its input: it runs the version it names, else the published one, or
 * on a workflow that is off the one saved last. A custom step's test run, which only the engine starts, names no
 * workflow but the step version it ran alone (`test_step`).
 */
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
      trace: f.enum(traceModes).optional(),
      trace_file: f.file().optional().readOnly(),
      started_by: f.text().optional().readOnly(),
      rerun_of: f.relation('workflow_runs').optional().filterable(),
      rerun_from: f.text().optional().max(200),
      replay: f.boolean().optional(),
      // Only the engine starts a block's run; a replay or re-run of one copies the Block it runs.
      block_of: f.relation('workflow_runs').optional().readOnly().filterable(),
      block_state: f.text().optional().readOnly(),
      block_visit: f.text().optional().readOnly(),
      // Only the engine starts a custom step's test run, which names no workflow.
      test_step: f.text().optional().readOnly(),
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
  // A run is shown on its workflow's graph, on the version it ran on; a custom step's test run, of no workflow, on its own page
  .recordOpens({ kind: 'record', resource: 'workflows', key: '{{workflow_id}}', run: '{{id}}' })
  // A test run starts in place, on the workflow's page
  .createOpens({ kind: 'record', resource: 'workflows', key: '{{workflow_id}}', panel: 'test_run' })
  .help('A run of a workflow with its input. It takes up where it stands after a restart; its trace lists each step with what it read, gave and logged.')
  .fields((r) => ({
    id: r.id.label('Steps').widget('workflow_run'),
    workflow_id: r.workflow_id.label('Workflow'),
    input: r.input.widget('json').help('Read by every state as $states.context.Execution.Input; a re-run takes the input of the run it re-runs'),
    rerun_of: r.rerun_of.label('Re-run of').help("A failed run of the workflow: the re-run goes on from that run's last checkpoint on the workflow as it is now, so no write whose checkpoint was saved happens again; with Replay, a run that ended, run again from the start"),
    rerun_from: r.rerun_from.label('Re-run from').help("The step to re-run from, not one inside For each. Set Re-run of to a run that ended and kept its trace. Earlier steps keep their results. The chosen step and every step after it run again, and anything they send goes out again").notOnCreate(),
    replay: r.replay.label('Replay').help("With Re-run of, runs that run again from the start on its version and input: its steps that write, such as mail, record writes and requests other than GET, are not sent and give what its trace says they gave then, nothing when it kept none, and its reads are served from the step cache"),
    key: r.key.help('A workflow runs once per key, such as the record a trigger found ready'),
    status: r.status.valueLabels({ queued: 'Queued', running: 'Running', waiting: 'Waiting', succeeded: 'Succeeded', failed: 'Failed' }).valueColors({ succeeded: 'green', failed: 'red' }),
    output: r.output.widget('json'),
    resume_at: r.resume_at.label('Goes on at'),
    trace: r.trace
      .valueLabels({ all: 'Keep a trace', failed: 'Keep a trace if it fails', none: 'Keep no trace' })
      .help("Whether the run keeps a trace of its steps; by default as its workflow, else the app, says"),
    trace_file: r.trace_file.label('Trace').help('Every step with its input, output, logs and timing, one JSON object a line, once the run ended'),
    started_by: r.started_by.label('Started by'),
    block_of: r.block_of.label('Block of').help("The run whose Block this run ran: it runs that Block's steps alone, and its result went back to that run"),
    block_state: r.block_state.label('Block').help('The Block whose steps this run runs'),
    test_step: r.test_step.label('Tested step').help('The custom step version this run tested alone, with no workflow'),
    created_at: r.created_at.label('Started'),
    finished_at: r.finished_at.label('Finished'),
    duration_ms: r.duration_ms.label('Duration (ms)'),
  }))
  .list((r) => ({ columns: [r.created_at, r.workflow_id, r.test_step, r.status, r.started_by, r.duration_ms, r.error], sort: [[r.created_at, 'desc']] }))
  .actions((a) => [
    a.link('replay', { label: 'Replay without writing', icon: 'history', to: { kind: 'record', resource: 'workflows', key: '{{workflow_id}}', run: '{{id}}', panel: 'replay' }, when: '(status = "succeeded" OR status = "failed") AND workflow_id:*' }),
    a.link('rerun', { label: 'Re-run from a step', icon: 'restart', to: { kind: 'record', resource: 'workflows', key: '{{workflow_id}}', run: '{{id}}' }, when: '(status = "succeeded" OR status = "failed") AND workflow_id:*' }),
  ])
  .layout((r) => [
    l.section('Trace', [r.id]),
    l.section('Run', [r.workflow_id, r.test_step, r.input, r.output, r.error, r.cause, r.trace_file]),
    l.sidebar([r.status, r.version, r.trace, r.started_by, r.block_of, r.block_state, r.rerun_of, r.rerun_from, r.replay, r.created_at, r.resume_at, r.finished_at, r.duration_ms]),
    l.related('Re-runs', { resource: 'workflow_runs', field: 'rerun_of', columns: ['status', 'started_by', 'created_at', 'duration_ms', 'error'] }),
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

// Storage configurations, custom steps and runners have no sidebar entry: each workflow's page links to them.
const linkedFrom = ({ storage, customSteps }: { storage: boolean; customSteps: boolean }) => {
  if (!storage && !customSteps) return workflowsView
  return workflowsView.actions((a) => [
    ...(storage ? [a.link('storage_configurations', { label: 'Storage configurations', icon: 'archive', to: { kind: 'list', resource: 'storage_configurations' } })] : []),
    ...(customSteps ? [a.link('workflow_custom_steps', { label: 'Custom steps', icon: 'wrench', to: { kind: 'list', resource: 'workflow_custom_steps' } }), a.link('workflow_runners', { label: 'Runners', icon: 'server', to: { kind: 'list', resource: 'workflow_runners' } })] : []),
  ])
}

/**
 * The resources and views `workflows` adds to an app, over the tables of `schema`: Workflows with their versions and
 * runs, with `storage` the storage configurations their steps store files in, and with `customSteps` the custom steps
 * their Tasks may name, with their versions, the runners that run them and the jobs they claim. Config only; the server
 * checks and runs them.
 */
export const workflowResources = (schema: string, { storage = false, customSteps = false }: { storage?: boolean; customSteps?: boolean } = {}) => ({
  workflows: workflowsResource(schema),
  workflowsView: linkedFrom({ storage, customSteps }),
  workflowVersions: versionsResource(schema),
  workflowVersionsView: versionsView,
  workflowRuns: runsResource(schema),
  workflowRunsView: runsView,
  workflowTriggers: triggersResource(schema),
  workflowTriggersView: triggersView,
  workflowResolutions: resolutionsResource(schema),
  workflowResolutionsView: resolutionsView,
  ...(storage && storageConfigurationResources(schema)),
  ...(customSteps && customStepResources(schema)),
  ...(customSteps && runnerResources(schema)),
})
