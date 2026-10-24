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

/** The newest `window` successful runs whose jobs GitHub can give, newest first, each with its jobs. */
export const recentRuns = (workflow: WorkflowConfig, window: number, get: Api = api) => {
  const query = new URLSearchParams({ status: 'success', per_page: String(window) })
  if (workflow.event) query.set('event', workflow.event)
  if (workflow.branch) query.set('branch', workflow.branch)
  const { workflow_runs } = get<{ workflow_runs: ApiRun[] }>(`actions/workflows/${workflow.file}/runs?${query}`)
  return workflow_runs.flatMap((run) => {
    const jobs = jobsOf(run, get)
    return jobs ? [{ run, jobs }] : []
  })
}
