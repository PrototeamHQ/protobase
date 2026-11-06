// Whether a pull request with the auto-merge-approvals label may merge now. Pure: the caller fetches what it reads.
import type { ChecksState } from './checks'

export const approvalLabel = 'auto-merge-approvals'
export const holdLabel = 'do-not-merge'
const reviewBot = 'coderabbitai[bot]'
const writeRoles = new Set(['admin', 'maintain', 'write'])

export type PullRequest = {
  number: number
  state: string
  draft: boolean
  labels: { name: string }[]
  // repo is null for a fork that was deleted.
  head: { sha: string; ref: string; repo: { full_name: string } | null }
  base: { ref: string }
}
// Listed oldest first, as GitHub lists them. user is null for a deleted account.
export type Review = { user: { login: string } | null; state: string; commit_id: string; submitted_at: string }
export type TimelineEvent = { event: string; created_at?: string; label?: { name: string } }

export type Decision = {
  repository: string
  pull: PullRequest
  timeline: TimelineEvent[]
  reviews: Review[]
  // Each login of approvedLogins, with the role_name of GitHub's collaborator permission API.
  roles: Record<string, string>
  checks: ChecksState
  // Whether the review bot's own check on the head finished (reviewBotFinished).
  reviewBotFinished: boolean
}

// Why the pull request is out of the question whatever its reviews and checks say, or null.
export function pullRefusal(pull: PullRequest, repository: string) {
  if (pull.state !== 'open' || pull.draft) return 'it is not an open, ready pull request'
  if (pull.head.repo?.full_name !== repository) return `its head is not in ${repository}`
  const labels = pull.labels.map((label) => label.name)
  if (labels.includes(holdLabel)) return `it has the ${holdLabel} label`
  if (!labels.includes(approvalLabel)) return `it has no ${approvalLabel} label`
  return null
}

// When the label was last added, so taking it off and adding it again asks for a new approval. GitHub lists no event
// when the label's history is gone, and then no approval counts.
function labelledAt(timeline: TimelineEvent[]) {
  const added = timeline.filter((item) => item.event === 'labeled' && item.label?.name === approvalLabel)
  return added.length === 0 ? null : Math.max(...added.map((item) => Date.parse(item.created_at ?? '')))
}

const onHead = (reviews: Review[], head: string) => reviews.filter((review) => review.commit_id === head)

// The logins whose access the decision needs: those who approved the head, apart from the review bot, which holds none.
export function approvedLogins(reviews: Review[], head: string) {
  const logins = onHead(reviews, head).flatMap((review) => (review.state === 'APPROVED' && review.user ? [review.user.login] : []))
  return [...new Set(logins)].filter((login) => login !== reviewBot)
}

// A comment leaves a change request standing, as it does on GitHub, and dismissing one turns it into DISMISSED.
function standingChangeRequests(reviews: Review[], head: string) {
  const verdicts = new Map<string | undefined, string>()
  for (const review of onHead(reviews, head)) {
    if (review.state === 'APPROVED' || review.state === 'CHANGES_REQUESTED' || review.state === 'DISMISSED')
      verdicts.set(review.user?.login, review.state)
  }
  return [...verdicts].filter(([, state]) => state === 'CHANGES_REQUESTED').map(([login]) => login ?? 'a deleted account')
}

// Anyone but the author can comment `@coderabbitai approve` or `resolve`, and the bot then approves without a finished
// review and over its own findings. So its approval counts only with its check on the head finished and no change
// request of its own on that head; lifting one of those takes an approval from an account with write access.
function botApprovalCounts(reviews: Review[], head: string, finished: boolean) {
  const requested = onHead(reviews, head).some((review) => review.user?.login === reviewBot && review.state === 'CHANGES_REQUESTED')
  return finished && !requested
}

// Why the pull request may not merge as it is now, or null when its head may. Timestamps have whole seconds, and an
// approval in the same second as the label does not count, as it cannot be shown to have come after it.
export function refusal({ repository, pull, timeline, reviews, roles, checks, reviewBotFinished }: Decision) {
  const refused = pullRefusal(pull, repository)
  if (refused) return refused

  const head = pull.head.sha
  const requesters = standingChangeRequests(reviews, head)
  if (requesters.length > 0) return `changes are requested by ${requesters.join(', ')}`

  const labelled = labelledAt(timeline)
  const botCounts = botApprovalCounts(reviews, head, reviewBotFinished)
  const mayApprove = (login: string | undefined) => (login === reviewBot ? botCounts : writeRoles.has(roles[login ?? ''] ?? ''))
  const approved =
    labelled !== null &&
    onHead(reviews, head).some((review) => review.state === 'APPROVED' && Date.parse(review.submitted_at) > labelled && mayApprove(review.user?.login))
  if (!approved) return `no approval of ${head.slice(0, 7)} came after the ${approvalLabel} label`

  if (checks.state === 'red') return `these did not pass: ${checks.names.join(', ')}`
  if (checks.state === 'pending') return `these still run: ${checks.names.join(', ')}`
  return null
}
