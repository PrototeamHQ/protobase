import { describe, expect, it, vi } from 'vitest'
import { afterMerge } from './after-merge'

const client = (over = {}) => ({
  dispatchWorkflow: vi.fn(async () => {}),
  deletesHeadOnMerge: vi.fn(async () => true),
  openPullsOnto: vi.fn(async () => 0),
  deleteBranch: vi.fn(async () => {}),
  ...over,
})
const merged = { number: 1, base: 'main', head: 'topic' }

describe('afterMerge', () => {
  it('starts the release and the docs and deletes the head after a merge into main', async () => {
    const github = client()
    await afterMerge(github, merged)
    expect(github.dispatchWorkflow).toHaveBeenCalledWith('release.yml', 'main')
    expect(github.dispatchWorkflow).toHaveBeenCalledWith('docs.yml', 'main')
    expect(github.deleteBranch).toHaveBeenCalledWith('topic')
  })

  it('starts no workflow after a merge into another branch, and deletes the head', async () => {
    const github = client()
    await afterMerge(github, { ...merged, base: 'next' })
    expect(github.dispatchWorkflow).not.toHaveBeenCalled()
    expect(github.deleteBranch).toHaveBeenCalledWith('topic')
  })

  it('still starts the docs and deletes when the release does not start, and fails the run', async () => {
    const dispatchWorkflow = vi.fn(async (workflow: string) => {
      if (workflow === 'release.yml') throw new Error('release refused')
    })
    const github = client({ dispatchWorkflow })
    await expect(afterMerge(github, merged)).rejects.toThrow('release refused')
    expect(dispatchWorkflow).toHaveBeenCalledWith('docs.yml', 'main')
    expect(github.deleteBranch).toHaveBeenCalled()
  })

  it('reports every step that failed', async () => {
    const refused = vi.fn(async () => Promise.reject(new Error('refused')))
    const github = client({ dispatchWorkflow: refused, deleteBranch: vi.fn(async () => Promise.reject(new Error('kept'))) })
    await expect(afterMerge(github, merged)).rejects.toThrow(/refused.*kept/)
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
