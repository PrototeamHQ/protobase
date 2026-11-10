// Merges a pull request once, and reads why GitHub refused when it did.

type Pull = { merged: boolean; head: { sha: string }; mergeable_state: string }
type Client = {
  merge(number: number, sha: string): Promise<string | null>
  pullRequest(number: number): Promise<Pull>
}

// Why a refusal leaves nothing to do, or null when it does not: another run merged it first, a head that moved needs
// a new approval, and a change request GitHub still counts waits for what lifts it.
function nothingToDo(pull: Pull, sha: string) {
  if (pull.merged) return 'another run merged it first'
  if (pull.head.sha !== sha) return 'its head moved'
  if (pull.mergeable_state === 'blocked') return 'a block stands'
  return null
}

// The merge commit, or why there is nothing to do. Any other refusal fails the run. A run that loses to another run's
// merge can read the pull request before GitHub marks it merged, in state `unknown`, so that state is read once more.
export async function merge(github: Client, number: number, sha: string) {
  const mergeCommit = await github.merge(number, sha)
  if (mergeCommit) return { mergeCommit }

  let now = await github.pullRequest(number)
  if (now.mergeable_state === 'unknown' && !nothingToDo(now, sha)) now = await github.pullRequest(number)
  const reason = nothingToDo(now, sha)
  if (reason) return { reason }
  throw new Error(`GitHub refused to merge #${number}: its merge state is ${now.mergeable_state}`)
}
