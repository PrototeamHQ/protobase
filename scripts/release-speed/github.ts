// Reads a workflow's recent successful runs and their jobs from the GitHub Actions API through the gh CLI, which takes
// its token from GH_TOKEN in a workflow and from `gh auth login` locally.
import { GhServerError, ghApi } from './gh-api'
import type { WorkflowConfig } from './report'
import type { ApiJob, ApiRun } from './timings'

// In a workflow, the repository it runs in; locally, gh fills in the repository of the checkout's remote.
const repository = process.env.GITHUB_REPOSITORY ?? '{owner}/{repo}'

type Api = <T>(path: string) => T

const api: Api = (path) => ghApi(`repos/${repository}/${path}`)

// GitHub can keep answering a single run's jobs with a 502 for hours while every other run reads fine, so that run is
// left out of the window rather than failing the whole report; the report's run count shows it.
const jobsOf = (run: ApiRun, get: Api) => {
  try {
    return get<{ jobs: ApiJob[] }>(`actions/runs/${run.id}/jobs?per_page=100`).jobs
  } catch (error) {
    if (error instanceof GhServerError) return undefined
    throw error
  }
}

// A merge by the AI review pushes with the workflow's built-in token, which starts no workflow, so it starts the release
// through a dispatch on the default branch instead: a `workflow_dispatch` of the release workflow, or a
// `repository_dispatch` a listener takes up. Those runs count as a push to main does.
const defaultBranch = 'main'

export interface RunFilter {
  event?: string
  branch?: string
}

/**
 * The event and branch filters a workflow's window takes its runs from: its own and, for push runs, a merge's dispatch.
 * Only a push window on main takes the `workflow_dispatch` runs: the AI review dispatches the release workflow alone.
 */
export const runFilters = (workflow: WorkflowConfig): RunFilter[] => {
  const own = { event: workflow.event, branch: workflow.branch }
  if (workflow.event !== 'push') return [own]
  if (workflow.branch && workflow.branch !== defaultBranch) return [own]
  const repositoryDispatch = { event: 'repository_dispatch', branch: defaultBranch }
  if (!workflow.branch) return [own, repositoryDispatch]
  return [own, repositoryDispatch, { event: 'workflow_dispatch', branch: defaultBranch }]
}

/**
 * Whether a run releases what was merged. A `workflow_dispatch` given a tag publishes that existing tag again and skips
 * the release workflow's `plan` job, which every release of main's head runs, so a dispatch counts only when plan ran.
 */
export const releasesMerge = (run: ApiRun, jobs: ApiJob[]) => {
  if (run.event !== 'workflow_dispatch') return true
  return jobs.some((job) => job.name === 'plan' && job.conclusion === 'success')
}

const successfulRuns = (workflow: WorkflowConfig, filter: RunFilter, window: number, get: Api) => {
  const query = new URLSearchParams({ status: 'success', per_page: String(window) })
  if (filter.event) query.set('event', filter.event)
  if (filter.branch) query.set('branch', filter.branch)
  return get<{ workflow_runs: ApiRun[] }>(`actions/workflows/${workflow.file}/runs?${query}`).workflow_runs
}

/** The newest successful runs that release a merge, up to `window` of them, newest first, each with its jobs. */
export const recentRuns = (workflow: WorkflowConfig, window: number, get: Api = api) => {
  const runs = runFilters(workflow)
    .flatMap((filter) => successfulRuns(workflow, filter, window, get))
    .sort((a, b) => Date.parse(b.run_started_at) - Date.parse(a.run_started_at))
  // A run left out for its jobs' 5xx still takes its place in the window; a dispatch that releases no merge does not.
  const taken: { run: ApiRun; jobs: ApiJob[] }[] = []
  let places = window
  for (const run of runs) {
    if (places === 0) break
    const jobs = jobsOf(run, get)
    if (jobs && !releasesMerge(run, jobs)) continue
    places -= 1
    if (jobs) taken.push({ run, jobs })
  }
  return taken
}
