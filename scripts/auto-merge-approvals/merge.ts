// Merges a pull request once, and reads why GitHub refused when it did.

type Pull = { merged: boolean; head: { sha: string }; mergeable_state: string }
type Client = {
  merge(number: number, sha: string): Promise<string | null>
  pullRequest(number: number): Promise<Pull>
}

// A refusal that leaves nothing to do: another run merged it first, a head that moved needs a new approval, and a
// change request GitHub still counts waits for what lifts it.
const settled = (pull: Pull, sha: string) => pull.merged || pull.head.sha !== sha || pull.mergeable_state === 'blocked'

// The merge commit, or null when there is nothing to do. Any other refusal fails the run. A run that loses to another
// run's merge can read the pull request before GitHub marks it merged, in state `unknown`, so that state is read once more.
export async function merge(github: Client, number: number, sha: string) {
  const mergeCommit = await github.merge(number, sha)
  if (mergeCommit) return mergeCommit

  let now = await github.pullRequest(number)
  if (settled(now, sha)) return null
  if (now.mergeable_state === 'unknown') now = await github.pullRequest(number)
  if (settled(now, sha)) return null
  throw new Error(`GitHub refused to merge #${number}: its merge state is ${now.mergeable_state}`)
}
