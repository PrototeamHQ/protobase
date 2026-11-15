import { f } from '../fields'
import { layout as l } from '../layout'
import { resource } from '../resource'
import { view } from '../view'

export const customStepJobStatuses = ['queued', 'running', 'succeeded', 'failed', 'timed_out'] as const
export const customStepBuildStatuses = ['building', 'ready', 'failed'] as const

/**
 * A machine that runs the app's custom steps: made here, it registers once with a one-time token, then claims its
 * tenant's jobs with a token of its own. Revoking or deleting it refuses that token, and puts the jobs it holds back in
 * the queue. Making, changing and deleting one are grants of their own.
 */
const runnersResource = (schema: string) =>
  resource('workflow_runners')
    .table(`${schema}.runners`)
    .fields({
      id: f.uuid().readOnly().dbDefault(),
      name: f.text().min(1).max(100).sortable(),
      labels: f.json().dbDefault(),
      revoked: f.boolean().dbDefault(),
      revoked_at: f.timestamp().optional().readOnly(),
      registration_expires_at: f.timestamp().optional().readOnly(),
      registered_at: f.timestamp().optional().readOnly(),
      platform: f.text().optional().readOnly(),
      kinds: f.json().readOnly().dbDefault(),
      state: f.json().optional().readOnly(),
      polled_at: f.timestamp().optional().readOnly(),
      polling_until: f.timestamp().optional().readOnly(),
      tenant_id: f.text().optional().readOnly(),
      created_at: f.timestamp().readOnly().dbDefault(),
      updated_at: f.timestamp().readOnly().dbDefault().sortable(),
    })
    .primaryKey((r) => r.id)
    .tenant((r) => r.tenant_id)
    .etagFrom((r) => r.updated_at)
    .search((r) => [r.name])
    .explicitGrants()

const runnersView = view<ReturnType<typeof runnersResource>>('workflow_runners')
  .names({ singular: 'Runner', plural: 'Runners' })
  .icon('server')
  .nav({ hidden: true })
  .title((r) => r.name)
  .help('A machine that runs your custom steps. Once made, it registers with a one-time token that is valid for an hour, then claims the jobs of your custom steps. Revoking it refuses it from its next call on, and its jobs go back to the queue.')
  .fields((r) => ({
    name: r.name.label('Name'),
    labels: r.labels.label('Labels').widget('json').help('A list of labels, such as ["gpu"], for jobs that need them'),
    revoked: r.revoked.label('Revoked').help('Refuses the runner from its next call on and puts its jobs back in the queue; it cannot be undone'),
    revoked_at: r.revoked_at.label('Revoked at'),
    registration_expires_at: r.registration_expires_at.label('Registration token valid until'),
    registered_at: r.registered_at.label('Registered'),
    platform: r.platform.label('Platform'),
    kinds: r.kinds.label('Kinds').widget('json'),
    state: r.state.label('Last state').widget('json').help('What the runner said of itself with its last claim: its free slots, the images it holds and its warm instances'),
    polled_at: r.polled_at.label('Last claim'),
    polling_until: r.polling_until.label('Claiming until'),
    created_at: r.created_at.label('Created'),
    updated_at: r.updated_at.label('Updated'),
  }))
  .list((r) => ({ columns: [r.name, r.platform, r.registered_at, r.polled_at, r.revoked], sort: [[r.name, 'asc']] }))
  .layout((r) => [
    l.section('Runner', [r.name, r.labels, r.revoked]),
    l.section('Machine', [r.platform, r.kinds, r.state]),
    l.sidebar([r.registration_expires_at, r.registered_at, r.polled_at, r.polling_until, r.revoked_at, r.created_at, r.updated_at]),
    l.related('Jobs', { resource: 'workflow_custom_step_jobs', field: 'runner_id', columns: ['step', 'status', 'queued_at'] }),
  ])

/**
 * Each try of a custom step that a run queued for a runner, with the input it took, the runner that holds or held it,
 * and how it ended, which hold a run's data as its runs do, so reading them is a grant of its own. Only the server
 * writes them; the try's token is never among their fields.
 */
const customStepJobsResource = (schema: string) =>
  resource('workflow_custom_step_jobs')
    .table(`${schema}.custom_step_jobs`)
    .fields({
      id: f.uuid().readOnly().dbDefault(),
      run_id: f.relation('workflow_runs').readOnly().filterable(),
      state: f.text().readOnly(),
      step: f.text().readOnly(),
      version_id: f.relation('workflow_custom_step_versions').readOnly(),
      input: f.json().optional().readOnly(),
      status: f.enum(customStepJobStatuses).readOnly().filterable(),
      runner_id: f.relation('workflow_runners').optional().readOnly().filterable(),
      requeues: f.integer().readOnly(),
      lease_until: f.timestamp().optional().readOnly(),
      queued_at: f.timestamp().readOnly().sortable(),
      claimed_at: f.timestamp().optional().readOnly(),
      finished_at: f.timestamp().optional().readOnly(),
      output: f.json().optional().readOnly(),
      error: f.text().optional().readOnly(),
      cause: f.text().optional().readOnly(),
      logs: f.json().readOnly(),
      tenant_id: f.text().optional().readOnly(),
    })
    .primaryKey((r) => r.id)
    .tenant((r) => r.tenant_id)
    .explicitGrants()
    .access({ create: () => false, update: () => false, delete: () => false })

const statusLabels = { queued: 'Queued', running: 'Running', succeeded: 'Succeeded', failed: 'Failed', timed_out: 'Timed out' }

const customStepJobsView = view<ReturnType<typeof customStepJobsResource>>('workflow_custom_step_jobs')
  .names({ singular: 'Custom step job', plural: 'Custom step jobs' })
  .icon('play')
  .nav({ hidden: true })
  .title((r) => r.step)
  .fields((r) => ({
    run_id: r.run_id.label('Run'),
    state: r.state.label('State'),
    step: r.step.label('Step'),
    version_id: r.version_id.label('Version'),
    input: r.input.label('Input').widget('json'),
    status: r.status.label('Status').valueLabels(statusLabels),
    runner_id: r.runner_id.label('Runner'),
    requeues: r.requeues.label('Requeued'),
    lease_until: r.lease_until.label('Held until'),
    queued_at: r.queued_at.label('Queued'),
    claimed_at: r.claimed_at.label('Claimed'),
    finished_at: r.finished_at.label('Finished'),
    output: r.output.label('Output').widget('json'),
    error: r.error.label('Error'),
    cause: r.cause.label('Cause'),
    logs: r.logs.label('Logs').widget('json'),
  }))
  .list((r) => ({ columns: [r.step, r.status, r.runner_id, r.queued_at, r.finished_at], sort: [[r.queued_at, 'desc']] }))

/**
 * Each build of a custom step version's image on a runner, as the runner reports it: building, then ready with the
 * image's digest, or failed, with the tail of its log. Only the server writes them.
 */
const customStepBuildsResource = (schema: string) =>
  resource('workflow_custom_step_builds')
    .table(`${schema}.custom_step_builds`)
    .fields({
      id: f.uuid().readOnly().dbDefault(),
      runner_id: f.relation('workflow_runners').optional().readOnly().filterable(),
      version_id: f.relation('workflow_custom_step_versions').readOnly().filterable(),
      step: f.text().readOnly(),
      status: f.enum(customStepBuildStatuses).readOnly().filterable(),
      digest: f.text().optional().readOnly(),
      log: f.text().optional().readOnly(),
      started_at: f.timestamp().readOnly().sortable(),
      finished_at: f.timestamp().optional().readOnly(),
      tenant_id: f.text().optional().readOnly(),
    })
    .primaryKey((r) => r.id)
    .tenant((r) => r.tenant_id)
    .explicitGrants()
    .access({ create: () => false, update: () => false, delete: () => false })

const customStepBuildsView = view<ReturnType<typeof customStepBuildsResource>>('workflow_custom_step_builds')
  .names({ singular: 'Custom step build', plural: 'Custom step builds' })
  .icon('hammer')
  .nav({ hidden: true })
  .title((r) => r.step)
  .fields((r) => ({
    runner_id: r.runner_id.label('Runner'),
    version_id: r.version_id.label('Version'),
    step: r.step.label('Step'),
    status: r.status.label('Status').valueLabels({ building: 'Building', ready: 'Ready', failed: 'Failed' }),
    digest: r.digest.label('Image digest'),
    log: r.log.label('Log').help('The end of the build\'s log, as its runner reported it'),
    started_at: r.started_at.label('Started'),
    finished_at: r.finished_at.label('Finished'),
  }))
  .list((r) => ({ columns: [r.step, r.status, r.runner_id, r.started_at, r.finished_at], sort: [[r.started_at, 'desc']] }))

/**
 * The runners of the custom steps of the workflows over `schema`, with the jobs they claim and the images they build,
 * offered with custom steps.
 */
export const runnerResources = (schema: string) => ({
  runners: runnersResource(schema),
  runnersView,
  customStepJobs: customStepJobsResource(schema),
  customStepJobsView,
  customStepBuilds: customStepBuildsResource(schema),
  customStepBuildsView,
})
