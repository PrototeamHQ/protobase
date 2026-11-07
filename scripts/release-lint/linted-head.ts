// A run by hand releases main's head as a push does, and a push lints only the commits since the head the previous run
// was started for: a commit that run linted, passed or failed, is never linted again, so a malformed message that
// reached main fails one release and never blocks the later ones. A run whose commits job was skipped, such as a publish
// by hand of a tag, or never finished, such as a cancelled one, linted nothing.
import type { Api } from '../release-speed/github'

interface Run {
  id: number
  head_sha: string
}

interface Job {
  name: string
  conclusion: string | null
}

// The newest runs checked for one that linted; past them a run by hand lints the commits since the newest tag.
export const runsChecked = 20

const linted = (jobs: Job[]) => jobs.some((job) => job.name === 'commits' && (job.conclusion === 'success' || job.conclusion === 'failure'))

/** The head of the newest completed release run of main, other than `currentRun`, whose commits job linted. */
export const lintedHead = (currentRun: number, get: Api) => {
  const { workflow_runs: runs } = get<{ workflow_runs: Run[] }>(`actions/workflows/release.yml/runs?branch=main&status=completed&per_page=${runsChecked}`)
  for (const run of runs) {
    if (run.id === currentRun) continue
    const { jobs } = get<{ jobs: Job[] }>(`actions/runs/${run.id}/jobs?per_page=100`)
    if (linted(jobs)) return run.head_sha
  }
  return
}
