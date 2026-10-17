// Reads a workflow's recent successful runs and their jobs from the GitHub Actions API through the gh CLI, which takes
// its token from GH_TOKEN in a workflow and from `gh auth login` locally.
import { spawnSync } from 'node:child_process'
import type { WorkflowConfig } from './report'
import type { ApiJob, ApiRun } from './timings'

// In a workflow, the repository it runs in; locally, gh fills in the repository of the checkout's remote.
const repository = process.env.GITHUB_REPOSITORY ?? '{owner}/{repo}'

const api = <T>(path: string): T => {
  const result = spawnSync('gh', ['api', `repos/${repository}/${path}`], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  if (result.status !== 0) throw new Error(`gh api ${path} failed with status ${result.status}: ${result.stderr.trim()}`)
  return JSON.parse(result.stdout) as T
}

/** The newest `window` successful runs, newest first, each with its jobs. */
export const recentRuns = (workflow: WorkflowConfig, window: number) => {
  const query = new URLSearchParams({ status: 'success', per_page: String(window) })
  if (workflow.event) query.set('event', workflow.event)
  if (workflow.branch) query.set('branch', workflow.branch)
  const { workflow_runs } = api<{ workflow_runs: ApiRun[] }>(`actions/workflows/${workflow.file}/runs?${query}`)
  return workflow_runs.map((run) => ({ run, jobs: api<{ jobs: ApiJob[] }>(`actions/runs/${run.id}/jobs?per_page=100`).jobs }))
}
