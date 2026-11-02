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
// and ci through a `repository_dispatch` on the default branch instead: those runs count as a push to main does.
const defaultBranch = 'main'

export interface RunFilter {
  event?: string
  branch?: string
}

/** The event and branch filters a workflow's window takes its runs from: its own and, for push runs, a merge's dispatch. */
export const runFilters = (workflow: WorkflowConfig): RunFilter[] => {
  const own = { event: workflow.event, branch: workflow.branch }
  if (workflow.event !== 'push') return [own]
  if (workflow.branch && workflow.branch !== defaultBranch) return [own]
  return [own, { event: 'repository_dispatch', branch: defaultBranch }]
}

const successfulRuns = (workflow: WorkflowConfig, filter: RunFilter, window: number, get: Api) => {
  const query = new URLSearchParams({ status: 'success', per_page: String(window) })
  if (filter.event) query.set('event', filter.event)
  if (filter.branch) query.set('branch', filter.branch)
  return get<{ workflow_runs: ApiRun[] }>(`actions/workflows/${workflow.file}/runs?${query}`).workflow_runs
}

/** The newest `window` successful runs whose jobs GitHub can give, newest first, each with its jobs. */
export const recentRuns = (workflow: WorkflowConfig, window: number, get: Api = api) => {
  const runs = runFilters(workflow)
    .flatMap((filter) => successfulRuns(workflow, filter, window, get))
    .sort((a, b) => Date.parse(b.run_started_at) - Date.parse(a.run_started_at))
    .slice(0, window)
  return runs.flatMap((run) => {
    const jobs = jobsOf(run, get)
    return jobs ? [{ run, jobs }] : []
  })
}
