import { describe, expect, it, vi } from 'vitest'
import { afterMerge } from './after-merge'

const client = (over = {}) => ({
  dispatchWorkflow: vi.fn(async () => {}),
  dispatch: vi.fn(async () => {}),
  deletesHeadOnMerge: vi.fn(async () => true),
  openPullsOnto: vi.fn(async () => 0),
  deleteBranch: vi.fn(async () => {}),
  ...over,
})
const merged = { number: 1, base: 'main', head: 'topic', mergeCommit: 'abc' }

describe('afterMerge', () => {
  it('starts the release, announces the merge and deletes the head after a merge into main', async () => {
    const github = client()
    await afterMerge(github, merged)
    expect(github.dispatchWorkflow).toHaveBeenCalledWith('release.yml', 'main')
    expect(github.dispatch).toHaveBeenCalledWith('pull_request_merged', { number: 1, base: 'main', sha: 'abc' })
    expect(github.deleteBranch).toHaveBeenCalledWith('topic')
  })

  it('starts no release after a merge into another branch, and does the rest', async () => {
    const github = client()
    await afterMerge(github, { ...merged, base: 'next' })
    expect(github.dispatchWorkflow).not.toHaveBeenCalled()
    expect(github.dispatch).toHaveBeenCalledWith('pull_request_merged', { number: 1, base: 'next', sha: 'abc' })
    expect(github.deleteBranch).toHaveBeenCalledWith('topic')
  })

  it('still announces and deletes when the release does not start, and fails the run', async () => {
    const github = client({ dispatchWorkflow: vi.fn(async () => Promise.reject(new Error('release refused'))) })
    await expect(afterMerge(github, merged)).rejects.toThrow('release refused')
    expect(github.dispatch).toHaveBeenCalled()
    expect(github.deleteBranch).toHaveBeenCalled()
  })

  it('reports every step that failed', async () => {
    const refused = vi.fn(async () => Promise.reject(new Error('refused')))
    const github = client({ dispatch: refused, deleteBranch: vi.fn(async () => Promise.reject(new Error('kept'))) })
    await expect(afterMerge(github, merged)).rejects.toThrow(/refused.*kept/)
    expect(github.dispatchWorkflow).toHaveBeenCalled()
  })

  it('keeps a head another open pull request merges into', async () => {
    const github = client({ openPullsOnto: vi.fn(async () => 1) })
    await afterMerge(github, merged)
    expect(github.deleteBranch).not.toHaveBeenCalled()
  })

  it('keeps the head when the repository does not delete head branches', async () => {
    const github = client({ deletesHeadOnMerge: vi.fn(async () => false) })
    await afterMerge(github, merged)
    expect(github.deleteBranch).not.toHaveBeenCalled()
  })
})
