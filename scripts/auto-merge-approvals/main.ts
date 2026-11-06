// Tries once to merge the pull requests a workflow event is about and never waits: a check still running leaves the
// merge to the event of the one that finishes last. The auto-merge-approvals workflow runs it.
//
//   GITHUB_REPOSITORY=owner/name GITHUB_EVENT_NAME=status GITHUB_EVENT_PATH=event.json GITHUB_RUN_ID=1 GITHUB_TOKEN=... bun scripts/auto-merge-approvals/main.ts
import { readFileSync } from 'node:fs'
import { afterMerge } from './after-merge'
import { checksState, reviewBotFinished } from './checks'
import { approvedLogins, pullRefusal, refusal } from './decision'
import { gitHub } from './github'
import { eventTarget, pullsOfCommit } from './target'

function required(name: string) {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is not set`)
  return value
}

const repository = required('GITHUB_REPOSITORY')
const github = gitHub(required('GITHUB_TOKEN'), repository)

async function pullNumbers() {
  const event = JSON.parse(readFileSync(required('GITHUB_EVENT_PATH'), 'utf8'))
  const target = eventTarget(required('GITHUB_EVENT_NAME'), event)
  if (target.sha === undefined) return [target.number]
  return pullsOfCommit(await github.commitPulls(target.sha), target.sha, repository)
}

async function checksOf(sha: string) {
  const [runs, checkRuns, statuses, ownWorkflowId] = await Promise.all([
    github.workflowRuns(sha),
    github.checkRuns(sha),
    github.statuses(sha),
    github.workflowId(required('GITHUB_RUN_ID')),
  ])
  return { checks: checksState(runs, checkRuns, statuses, ownWorkflowId), reviewBotFinished: reviewBotFinished(checkRuns) }
}

// Why the pull request may not merge now, or null. It reads no more of GitHub than the pull request itself needs.
async function whyNot(pull: Awaited<ReturnType<typeof github.pullRequest>>) {
  const refused = pullRefusal(pull, repository)
  if (refused) return refused

  const [timeline, reviews, head] = await Promise.all([github.timeline(pull.number), github.reviews(pull.number), checksOf(pull.head.sha)])
  const logins = approvedLogins(reviews, pull.head.sha)
  const roles = Object.fromEntries(await Promise.all(logins.map(async (login) => [login, await github.role(login)])))
  return refusal({ repository, pull, timeline, reviews, roles, ...head })
}

// The merge commit, or null when there is nothing to do. Another run may have merged it first, and a head that moved
// needs a new approval. A change request GitHub still counts waits for what lifts it. Any other refusal fails the run.
async function merge(number: number, sha: string) {
  const mergeCommit = await github.merge(number, sha)
  if (mergeCommit) return mergeCommit

  const now = await github.pullRequest(number)
  if (now.merged || now.head.sha !== sha || now.mergeable_state === 'blocked') return null
  throw new Error(`GitHub refused to merge #${number}: its merge state is ${now.mergeable_state}`)
}

for (const number of await pullNumbers()) {
  const pull = await github.pullRequest(number)
  const reason = await whyNot(pull)
  if (reason) {
    console.log(`Not merging #${number}: ${reason}.`)
    continue
  }

  const mergeCommit = await merge(number, pull.head.sha)
  if (!mergeCommit) {
    console.log(`Not merging #${number}: GitHub refused, as it merged already, its head moved or a block stands.`)
    continue
  }
  console.log(`Merged #${number} as ${mergeCommit.slice(0, 7)}.`)
  await afterMerge(github, { number, base: pull.base.ref, head: pull.head.ref })
}
