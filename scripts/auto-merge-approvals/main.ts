// Tries once to merge the pull requests a workflow event is about and never waits: a check still running leaves the
// merge to the event of the one that finishes last. The auto-merge-approvals workflow runs it.
//
//   GITHUB_REPOSITORY=owner/name GITHUB_EVENT_NAME=status GITHUB_EVENT_PATH=event.json GITHUB_RUN_ID=1 GITHUB_TOKEN=... bun scripts/auto-merge-approvals/main.ts
import { readFileSync } from 'node:fs'
import { afterMerge } from './after-merge'
import { checksState, reviewBotFinished } from './checks'
import { approvedLogins, pullRefusal, refusal, workflowRefusal } from './decision'
import { cleanFollowUpAt } from './follow-up'
import { gitHub } from './github'
import { merge } from './merge'
import { eventTarget, pullsOfCommit } from './target'
import { noticed, workflowNotice } from './workflow-notice'

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

  const [timeline, reviews, files, comments, head] = await Promise.all([
    github.timeline(pull.number),
    github.reviews(pull.number),
    github.files(pull.number),
    github.comments(pull.number),
    checksOf(pull.head.sha),
  ])
  // The author's access decides whether the follow-up check's verdict counts.
  const logins = new Set(approvedLogins(reviews, pull.head.sha))
  if (pull.user) logins.add(pull.user.login)
  const roles = Object.fromEntries(await Promise.all([...logins].map(async (login) => [login, await github.role(login)])))
  const followUpCleanAt = cleanFollowUpAt(comments, pull.head.sha)
  return refusal({ repository, pull, timeline, reviews, files, roles, followUpCleanAt, ...head })
}

for (const number of await pullNumbers()) {
  const pull = await github.pullRequest(number)
  const reason = await whyNot(pull)
  if (reason) {
    console.log(`Not merging #${number}: ${reason}.`)
    if (reason === workflowRefusal && !noticed(await github.comments(number))) await github.comment(number, workflowNotice)
    continue
  }

  const merged = await merge(github, number, pull.head.sha)
  if ('reason' in merged) {
    console.log(`Not merging #${number}: GitHub refused, as ${merged.reason}.`)
    continue
  }
  const { mergeCommit } = merged
  console.log(`Merged #${number} as ${mergeCommit.slice(0, 7)}.`)
  await afterMerge(github, { number, base: pull.base.ref, head: pull.head.ref })
}
