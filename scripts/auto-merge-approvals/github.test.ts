import { afterEach, describe, expect, it, vi } from 'vitest'
import { gitHub } from './github'

const answer = (status: number) => vi.fn(async () => new Response(null, { status }))

afterEach(() => vi.unstubAllGlobals())

describe('deleteBranch', () => {
  it.each([204, 404, 422])('takes %i as the branch being gone', async (status) => {
    vi.stubGlobal('fetch', answer(status))
    await expect(gitHub('token', 'owner/repo').deleteBranch('fm/topic')).resolves.toBeUndefined()
  })

  it('throws on any other answer', async () => {
    vi.stubGlobal('fetch', answer(403))
    await expect(gitHub('token', 'owner/repo').deleteBranch('fm/topic')).rejects.toThrow(
      'GitHub answered 403 for DELETE /repos/owner/repo/git/refs/heads/fm/topic',
    )
  })
})
