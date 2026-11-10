import { describe, expect, it, vi } from 'vitest'
import { merge } from './merge'

const pull = (over = {}) => ({ merged: false, head: { sha: 'abc' }, mergeable_state: 'clean', ...over })
const client = (mergeCommit: string | null, ...reads: ReturnType<typeof pull>[]) => {
  const pullRequest = vi.fn()
  for (const read of reads) pullRequest.mockResolvedValueOnce(read)
  return { merge: vi.fn(async () => mergeCommit), pullRequest }
}

describe('merge', () => {
  it('answers the merge commit and reads nothing more when GitHub merges', async () => {
    const github = client('def')
    expect(await merge(github, 1, 'abc')).toBe('def')
    expect(github.merge).toHaveBeenCalledTimes(1)
    expect(github.pullRequest).not.toHaveBeenCalled()
  })

  it('has nothing to do when another run merged it and GitHub showed that only on a second read', async () => {
    const github = client(null, pull({ mergeable_state: 'unknown' }), pull({ merged: true, mergeable_state: 'unknown' }))
    expect(await merge(github, 1, 'abc')).toBeNull()
    expect(github.pullRequest).toHaveBeenCalledTimes(2)
  })

  it('fails when the merge state stays unknown', async () => {
    const github = client(null, pull({ mergeable_state: 'unknown' }), pull({ mergeable_state: 'unknown' }))
    await expect(merge(github, 1, 'abc')).rejects.toThrow('GitHub refused to merge #1: its merge state is unknown')
    expect(github.pullRequest).toHaveBeenCalledTimes(2)
  })

  it('has nothing to do after one read when the head moved or a block stands', async () => {
    for (const read of [pull({ head: { sha: 'new' } }), pull({ mergeable_state: 'blocked' }), pull({ merged: true })]) {
      const github = client(null, read)
      expect(await merge(github, 1, 'abc')).toBeNull()
      expect(github.pullRequest).toHaveBeenCalledTimes(1)
    }
  })

  it('fails at once on another merge state', async () => {
    const github = client(null, pull({ mergeable_state: 'dirty' }))
    await expect(merge(github, 1, 'abc')).rejects.toThrow('its merge state is dirty')
    expect(github.pullRequest).toHaveBeenCalledTimes(1)
  })
})
