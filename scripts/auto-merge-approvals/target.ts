// The pull requests a workflow event is about. Pure: the caller reads the event and the pull requests of its commit.

type Event = {
  pull_request?: { number: number }
  workflow_run?: { head_sha: string }
  check_suite?: { head_sha: string }
  sha?: string
}
export type CommitPull = { number: number; state: string; head: { sha: string; repo: { full_name: string } | null } }

// A review or label event names its pull request; the others name a commit.
export function eventTarget(name: string, event: Event) {
  if (name === 'pull_request_review' || name === 'pull_request_target') return { number: event.pull_request!.number }
  if (name === 'workflow_run') return { sha: event.workflow_run!.head_sha }
  if (name === 'check_suite') return { sha: event.check_suite!.head_sha }
  if (name === 'status') return { sha: event.sha! }
  throw new Error(`auto-merge-approvals does not handle ${name} events`)
}

// Only an open pull request whose head is this very commit, in this repository, counts: a commit also lists the pull
// requests it was merged by.
export function pullsOfCommit(pulls: CommitPull[], sha: string, repository: string) {
  return pulls
    .filter((pull) => pull.state === 'open' && pull.head.sha === sha && pull.head.repo?.full_name === repository)
    .map((pull) => pull.number)
}
