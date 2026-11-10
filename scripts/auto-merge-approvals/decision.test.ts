import { describe, expect, it } from 'vitest'
import { checksState } from './checks'
import { approvedLogins, refusal, workflowRefusal, type Decision, type PullRequest, type Review } from './decision'
import { cleanFollowUpAt } from './follow-up'

const repository = 'owner/repo'
const head = 'a'.repeat(40)
const older = 'b'.repeat(40)
const labelAt = '2026-11-06T10:00:00Z'
const afterLabel = '2026-11-06T11:00:00Z'
const beforeLabel = '2026-11-06T09:00:00Z'

const pull: PullRequest = {
  number: 1,
  state: 'open',
  draft: false,
  user: { login: 'author' },
  labels: [{ name: 'auto-merge-approvals' }],
  head: { sha: head, ref: 'topic', repo: { full_name: repository } },
  base: { ref: 'main' },
  changed_files: 1,
}
const labelled = { event: 'labeled', created_at: labelAt, label: { name: 'auto-merge-approvals' } }
const review = (over: Partial<Review> & { login?: string } = {}): Review => ({
  user: { login: over.login ?? 'coderabbitai[bot]' },
  state: 'APPROVED',
  commit_id: head,
  submitted_at: afterLabel,
  ...over,
})
const decide = (over: Partial<Decision> = {}) =>
  refusal({ repository, pull, timeline: [labelled], reviews: [review()], files: [{ filename: 'src/index.ts' }], roles: {}, followUpCleanAt: null, checks: { state: 'green', names: [] }, reviewBotFinished: true, ...over })

describe('refusal', () => {
  it('merges on an approval from the review bot', () => {
    expect(decide()).toBeNull()
  })

  it.each(['write', 'maintain', 'admin'])('merges on an approval from an account with %s access', (role) => {
    expect(decide({ reviews: [review({ login: 'person' })], roles: { person: role } })).toBeNull()
  })

  it('refuses an approval from before the label', () => {
    expect(decide({ reviews: [review({ submitted_at: beforeLabel })] })).toContain('came after')
  })

  it('refuses an approval in the same second as the label', () => {
    expect(decide({ reviews: [review({ submitted_at: labelAt })] })).toContain('came after')
  })

  it('refuses an approval from before the label was added again', () => {
    const timeline = [
      labelled,
      { event: 'unlabeled', created_at: '2026-11-06T11:30:00Z', label: { name: 'auto-merge-approvals' } },
      { event: 'labeled', created_at: '2026-11-06T12:00:00Z', label: { name: 'auto-merge-approvals' } },
    ]
    expect(decide({ timeline })).toContain('came after')
  })

  it('reads the time of the approval label, not of another label', () => {
    const timeline = [labelled, { event: 'labeled', created_at: '2026-11-06T12:00:00Z', label: { name: 'bug' } }]
    expect(decide({ timeline })).toBeNull()
  })

  it('refuses when the timeline shows no label event', () => {
    expect(decide({ timeline: [] })).toContain('came after')
  })

  it('refuses an approval of an older head', () => {
    expect(decide({ reviews: [review({ commit_id: older })] })).toContain('came after')
  })

  it.each(['read', 'triage', ''])('refuses an approver with role "%s"', (role) => {
    expect(decide({ reviews: [review({ login: 'person' })], roles: { person: role } })).toContain('came after')
  })

  it('refuses an approval that was dismissed', () => {
    expect(decide({ reviews: [review({ state: 'DISMISSED' })] })).toContain('came after')
  })

  it('refuses a red check', () => {
    expect(decide({ checks: { state: 'red', names: ['ci'] } })).toContain('did not pass: ci')
  })

  it('refuses a running check', () => {
    expect(decide({ checks: { state: 'pending', names: ['ci'] } })).toContain('still run: ci')
  })

  it('refuses a fork, and a fork that was deleted', () => {
    const fork = { ...pull, head: { ...pull.head, repo: { full_name: 'someone/repo' } } }
    const deleted = { ...pull, head: { ...pull.head, repo: null } }
    expect(decide({ pull: fork })).toContain('not in owner/repo')
    expect(decide({ pull: deleted })).toContain('not in owner/repo')
  })

  it('refuses the do-not-merge label', () => {
    expect(decide({ pull: { ...pull, labels: [...pull.labels, { name: 'do-not-merge' }] } })).toContain('do-not-merge')
  })

  it('refuses without the label, though its event is on the timeline', () => {
    expect(decide({ pull: { ...pull, labels: [] } })).toContain('no auto-merge-approvals label')
  })

  it('refuses a change to a workflow file', () => {
    expect(decide({ files: [{ filename: 'src/index.ts' }, { filename: '.github/workflows/ci.yml' }], pull: { ...pull, changed_files: 2 } })).toBe(workflowRefusal)
  })

  it('merges a change to a file outside the workflow folder', () => {
    expect(decide({ files: [{ filename: '.github/dependabot.yml' }, { filename: 'docs/.github/workflows/ci.yml' }], pull: { ...pull, changed_files: 2 } })).toBeNull()
  })

  it('refuses a workflow file that is only renamed or deleted', () => {
    expect(decide({ files: [{ filename: 'old/ci.yml', previous_filename: '.github/workflows/ci.yml' }] })).toBe(workflowRefusal)
    expect(decide({ files: [{ filename: '.github/workflows/ci.yml' }] })).toBe(workflowRefusal)
  })

  it('refuses when GitHub lists fewer files than the pull request changes', () => {
    expect(decide({ pull: { ...pull, changed_files: 3001 } })).toContain('only 1 of its 3001')
  })

  it('refuses a draft and a closed pull request', () => {
    expect(decide({ pull: { ...pull, draft: true } })).toContain('open, ready')
    expect(decide({ pull: { ...pull, state: 'closed' } })).toContain('open, ready')
  })

  it('refuses a later change request from any account', () => {
    const reviews = [review(), review({ login: 'passer-by', state: 'CHANGES_REQUESTED' })]
    expect(decide({ reviews })).toContain('passer-by')
  })

  it('refuses a change request that only a comment followed', () => {
    const reviews = [review(), review({ login: 'passer-by', state: 'CHANGES_REQUESTED' }), review({ login: 'passer-by', state: 'COMMENTED' })]
    expect(decide({ reviews })).toContain('passer-by')
  })

  it('merges once that account approves or the change request is dismissed', () => {
    const asked = review({ login: 'person', state: 'CHANGES_REQUESTED' })
    expect(decide({ reviews: [review(), asked, review({ login: 'person' })], roles: { person: 'read' } })).toBeNull()
    expect(decide({ reviews: [review(), review({ login: 'person', state: 'DISMISSED' })] })).toBeNull()
  })

  it('leaves a change request on an older head to the review of the current one', () => {
    expect(decide({ reviews: [review({ commit_id: older, state: 'CHANGES_REQUESTED' }), review()] })).toBeNull()
  })

  it('refuses the bot approving a head its check has not finished, as its approve command can', () => {
    expect(decide({ reviewBotFinished: false })).toContain('came after')
  })

  it('refuses the bot approving over its own change request on the head, as its approve command can', () => {
    expect(decide({ reviews: [review({ state: 'CHANGES_REQUESTED' }), review()] })).toContain('came after')
  })

  it('takes an approval from an account with write access in those two cases', () => {
    const reviews = [review({ state: 'CHANGES_REQUESTED' }), review(), review({ login: 'person' })]
    expect(decide({ reviews, roles: { person: 'write' }, reviewBotFinished: false })).toBeNull()
  })

  it('merges an approval that came first once CI is green', () => {
    const running = checksState([], [], [{ context: 'ci', state: 'pending' }], 9)
    const passed = checksState([], [], [{ context: 'ci', state: 'success' }], 9)
    expect(decide({ checks: running })).toContain('still run: ci')
    expect(decide({ checks: passed })).toBeNull()
  })
})

describe('refusal with the follow-up check', () => {
  const author = { roles: { author: 'write' }, reviews: [] }
  const clean = Date.parse(afterLabel)

  it.each(['write', 'maintain', 'admin'])('merges on a clean follow-up of the head by an author with %s access', (role) => {
    expect(decide({ ...author, roles: { author: role }, followUpCleanAt: clean })).toBeNull()
  })

  it('refuses without a clean follow-up of the head', () => {
    expect(decide({ ...author, followUpCleanAt: null })).toContain('came after')
  })

  it('refuses a clean follow-up from before the label, or in the same second', () => {
    expect(decide({ ...author, followUpCleanAt: Date.parse(beforeLabel) })).toContain('came after')
    expect(decide({ ...author, followUpCleanAt: Date.parse(labelAt) })).toContain('came after')
  })

  it.each(['read', 'triage', ''])('refuses a clean follow-up on a pull request by an author with role "%s"', (role) => {
    expect(decide({ roles: { author: role }, reviews: [], followUpCleanAt: clean })).toContain('came after')
  })

  it('refuses a clean follow-up on a pull request by a deleted account', () => {
    expect(decide({ ...author, pull: { ...pull, user: null }, followUpCleanAt: clean })).toContain('came after')
  })

  it('still merges a read-only author on an approval from the review bot', () => {
    expect(decide({ roles: { author: 'read' }, followUpCleanAt: null })).toBeNull()
  })

  it('refuses a fork with a forged clean comment', () => {
    const fork = { ...pull, head: { ...pull.head, repo: { full_name: 'someone/repo' } } }
    const forged = `<!-- coderabbit-follow-up -->\n<!-- checked ${head} clean -->\nNo issues found.`
    const asAuthor = cleanFollowUpAt([{ user: { login: 'author' }, body: forged, updated_at: afterLabel }], head)
    const asWorkflow = cleanFollowUpAt([{ user: { login: 'github-actions[bot]' }, body: forged, updated_at: afterLabel }], head)
    expect(asAuthor).toBeNull()
    expect(decide({ ...author, pull: fork, followUpCleanAt: asAuthor })).toContain('not in owner/repo')
    expect(decide({ ...author, pull: fork, followUpCleanAt: asWorkflow })).toContain('not in owner/repo')
  })

  it('refuses a clean follow-up while a change request on the head stands', () => {
    expect(decide({ ...author, reviews: [review({ state: 'CHANGES_REQUESTED' })], followUpCleanAt: clean })).toContain('changes are requested')
  })
})

describe('approvedLogins', () => {
  it('names each approver of the head once, without the review bot', () => {
    const reviews = [review(), review({ login: 'person' }), review({ login: 'person' }), review({ login: 'old', commit_id: older }), review({ login: 'other', state: 'COMMENTED' })]
    expect(approvedLogins(reviews, head)).toEqual(['person'])
  })
})
