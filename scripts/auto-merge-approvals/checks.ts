// Whether everything that ran on a pull request's head passed, apart from this workflow's own runs. Pure: the caller
// fetches the workflow runs, check runs and commit statuses of the commit.

export type WorkflowRun = { name: string; event: string; workflow_id: number; check_suite_id: number; status: string; conclusion: string | null }
export type CheckRun = { name: string; status: string; conclusion: string | null; check_suite: { id: number }; app?: { slug: string } | null }
export type CommitStatus = { context: string; state: string }
export type ChecksState = { state: 'green' | 'pending' | 'red'; names: string[] }

// Whether CodeRabbit's own check on the commit finished, by the app that wrote it, as anything can take its name.
export const reviewBotFinished = (checkRuns: CheckRun[]) =>
  checkRuns.some((check) => check.app?.slug === 'coderabbitai' && check.name === 'CodeRabbit' && check.conclusion === 'success')

const passed = new Set(['success', 'skipped', 'neutral'])

// The newest run of each workflow for each event, from runs listed newest first, as GitHub lists them. A run that waits
// for approval never ran, so it is left out when the same workflow has a run for another event.
function latestRuns(runs: WorkflowRun[]) {
  const seen = new Set<string>()
  const latest = runs.filter((run) => {
    const key = `${run.workflow_id} ${run.event}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
  const ran = new Set(latest.filter((run) => run.conclusion !== 'action_required').map((run) => run.workflow_id))
  return latest.filter((run) => run.conclusion !== 'action_required' || !ran.has(run.workflow_id))
}

// Workflow runs count as well as check runs, because a queued run has no check runs yet. A head with nothing on it yet
// is pending, since its checks may not have started.
export function checksState(runs: WorkflowRun[], checkRuns: CheckRun[], statuses: CommitStatus[], ownWorkflowId: number): ChecksState {
  const latest = latestRuns(runs)
  const own = new Set(runs.filter((run) => run.workflow_id === ownWorkflowId).map((run) => run.check_suite_id))
  const stale = new Set(runs.filter((run) => !latest.includes(run)).map((run) => run.check_suite_id))
  const results = [
    ...latest
      .filter((run) => run.workflow_id !== ownWorkflowId)
      .map((run) => ({ name: run.name, done: run.status === 'completed', conclusion: run.conclusion })),
    ...checkRuns
      .filter((check) => !own.has(check.check_suite.id) && !stale.has(check.check_suite.id))
      // GitHub can leave a finished check run in_progress while it already holds a conclusion, so either means done.
      .map((check) => ({ name: check.name, done: check.status === 'completed' || check.conclusion !== null, conclusion: check.conclusion })),
    ...statuses.map((status) => ({ name: status.context, done: status.state !== 'pending', conclusion: status.state })),
  ]

  if (results.length === 0) return { state: 'pending', names: ['no check has started'] }
  const failed = results.filter((result) => result.done && !passed.has(result.conclusion ?? ''))
  if (failed.length > 0) return { state: 'red', names: failed.map((result) => result.name) }
  const waiting = results.filter((result) => !result.done)
  if (waiting.length > 0) return { state: 'pending', names: waiting.map((result) => result.name) }
  return { state: 'green', names: [] }
}
