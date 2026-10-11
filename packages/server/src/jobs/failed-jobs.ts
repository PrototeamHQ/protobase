import { f, l, resource, view, type AccessContext } from '@protobase/schema'
import { jobsSchema } from './schema'

const admins = ({ user }: AccessContext) => user?.roles?.includes('admin') ?? false

/**
 * The failed jobs, over the `jobs.failed` view: the admin app lists them with their last error, and retries or deletes
 * one through the view's triggers. Admins only, whatever the project's roles say.
 */
export const failedJobs = resource('failed_jobs')
  .table(`${jobsSchema}.failed`)
  .fields({
    id: f.uuid().readOnly().filterable(),
    name: f.text().readOnly().filterable().sortable(),
    error: f.text().optional().readOnly(),
    attempts: f.integer().readOnly(),
    failed_at: f.timestamp().readOnly().filterable().sortable(),
    created_at: f.timestamp().readOnly().sortable(),
    key: f.text().optional().readOnly().filterable(),
    payload: f.json().optional().readOnly(),
    output: f.json().optional().readOnly(),
    retry: f.boolean(),
  })
  .primaryKey((r) => r.id)
  .access({ list: admins, read: admins, update: admins, delete: admins, create: () => false })

export const failedJobsView = view<typeof failedJobs>('failed_jobs')
  .names({ singular: 'Failed job', plural: 'Failed jobs' })
  .icon('triangle-alert')
  .title((r) => r.name)
  .help('Jobs that used up their attempts, or failed for good. Retry one once its cause is fixed: it gets one more attempt.')
  .fields((r) => ({
    name: r.name.label('Job'),
    error: r.error.label('Last error'),
    failed_at: r.failed_at.label('Failed'),
    created_at: r.created_at.label('Enqueued'),
    output: r.output.label('Error details'),
  }))
  .list((r) => ({ columns: [r.name, r.error, r.attempts, r.failed_at], sort: [[r.failed_at, 'desc']] }))
  // What failed and with what, never `retry`, which only the Retry action sets.
  .layout((r) => [
    l.section('Failure', [r.error, r.output]),
    l.section('Job', [r.name, r.key, r.payload]),
    l.sidebar([r.attempts, r.failed_at, r.created_at]),
  ])
  .actions((a) => [
    a.update('retry', { label: 'Retry', icon: 'rotate-ccw', set: { retry: true }, confirm: 'Run this job once more, from now?' }),
    a.remove('delete', { label: 'Delete', icon: 'trash-2', confirm: 'Delete this job? It will not run again.' }),
  ])
