import { describe, expect, it, vi } from 'vitest'
import { land } from './land'

const pull = { number: 1, head: { sha: 'abc', ref: 'topic' }, base: { ref: 'main' } }
const read = (over = {}) => ({ merged: false, head: { sha: 'abc' }, mergeable_state: 'clean', ...over })
const client = (mergeCommit: string | null, now = read()) => ({
  merge: vi.fn(async () => mergeCommit),
  pullRequest: vi.fn(async () => now),
  dispatchWorkflow: vi.fn(async (_workflow: string, _ref: string) => {}),
  deletesHeadOnMerge: vi.fn(async () => true),
  openPullsOnto: vi.fn(async () => 0),
  deleteBranch: vi.fn(async () => {}),
})

describe('land', () => {
  it('starts the release once when this run merged the pull request', async () => {
    const github = client('def')
    await land(github, pull)
    expect(github.dispatchWorkflow.mock.calls.filter(([workflow]) => workflow === 'release.yml')).toHaveLength(1)
  })

  it('starts nothing when another run merged it first', async () => {
    const github = client(null, read({ merged: true }))
    await land(github, pull)
    expect(github.dispatchWorkflow).not.toHaveBeenCalled()
    expect(github.deleteBranch).not.toHaveBeenCalled()
  })

  it('starts nothing when GitHub refused and it is not merged', async () => {
    const github = client(null, read({ mergeable_state: 'blocked' }))
    await land(github, pull)
    expect(github.dispatchWorkflow).not.toHaveBeenCalled()
  })
})
