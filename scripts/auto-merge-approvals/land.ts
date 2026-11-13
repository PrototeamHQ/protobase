// Merges one pull request and starts what follows only when this run's merge call merged it: a run that finds it
// merged by another run, or refused, starts nothing, so one merge starts one release.
import { afterMerge } from './after-merge'
import { merge } from './merge'

type Pull = { number: number; head: { sha: string; ref: string }; base: { ref: string } }
type Client = Parameters<typeof merge>[0] & Parameters<typeof afterMerge>[0]

export async function land(github: Client, pull: Pull) {
  const merged = await merge(github, pull.number, pull.head.sha)
  if ('reason' in merged) {
    console.log(`Not merging #${pull.number}: GitHub refused, as ${merged.reason}.`)
    return
  }
  console.log(`Merged #${pull.number} as ${merged.mergeCommit.slice(0, 7)}.`)
  await afterMerge(github, { number: pull.number, base: pull.base.ref, head: pull.head.ref })
}
