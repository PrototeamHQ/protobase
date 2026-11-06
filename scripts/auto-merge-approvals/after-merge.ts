// What follows a merge. A merge with GITHUB_TOKEN starts no workflow, but the two dispatches do, and GitHub leaves its
// head branch behind. The release workflow runs without a tag only from main, so only a merge into main starts it. Each
// step runs whatever happens to the others, and any that failed then fail the run.

type Merged = { number: number; base: string; head: string; mergeCommit: string }
type Client = {
  dispatchWorkflow(workflow: string, ref: string): Promise<void>
  dispatch(eventType: string, payload: Record<string, unknown>): Promise<void>
  deletesHeadOnMerge(): Promise<boolean>
  openPullsOnto(base: string): Promise<number>
  deleteBranch(branch: string): Promise<void>
}

// A branch another open pull request merges into is kept, since deleting it would close that pull request.
async function deleteHead(github: Client, head: string) {
  if (!(await github.deletesHeadOnMerge()) || (await github.openPullsOnto(head)) > 0) return
  await github.deleteBranch(head)
}

export async function afterMerge(github: Client, { number, base, head, mergeCommit }: Merged) {
  const results = await Promise.allSettled([
    ...(base === 'main' ? [github.dispatchWorkflow('release.yml', base)] : []),
    github.dispatch('pull_request_merged', { number, base, sha: mergeCommit }),
    deleteHead(github, head),
  ])
  const failed = results.flatMap((result) => (result.status === 'rejected' ? [String(result.reason)] : []))
  if (failed.length > 0) throw new Error(`#${number} merged, but what follows failed: ${failed.join('; ')}`)
}
