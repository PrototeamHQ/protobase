import { afterEach, describe, expect, it, vi } from 'vitest'
import { getRetries, gitHub, retryPauseMs } from './github'

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

describe('files', () => {
  it('reads every page of the changed files', async () => {
    const page = (count: number) => Response.json(Array.from({ length: count }, (_, index) => ({ filename: `f${index}` })))
    const fetch = vi.fn().mockResolvedValueOnce(page(100)).mockResolvedValueOnce(page(1))
    vi.stubGlobal('fetch', fetch)
    await expect(gitHub('token', 'owner/repo').files(7)).resolves.toHaveLength(101)
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([
      'https://api.github.com/repos/owner/repo/pulls/7/files?per_page=100&page=1',
      'https://api.github.com/repos/owner/repo/pulls/7/files?per_page=100&page=2',
    ])
  })
})

describe('a server error', () => {
  afterEach(() => vi.useRealTimers())

  it('asks a GET again after a pause', async () => {
    vi.useFakeTimers()
    const fetch = vi.fn().mockResolvedValueOnce(new Response(null, { status: 502 })).mockResolvedValueOnce(Response.json([]))
    vi.stubGlobal('fetch', fetch)
    const timeline = gitHub('token', 'owner/repo').timeline(7)
    await vi.advanceTimersByTimeAsync(retryPauseMs)
    await expect(timeline).resolves.toEqual([])
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('fails a GET that keeps failing after the fixed retries', async () => {
    vi.useFakeTimers()
    const fetch = answer(503)
    vi.stubGlobal('fetch', fetch)
    const timeline = gitHub('token', 'owner/repo').timeline(7)
    const failed = expect(timeline).rejects.toThrow('GitHub answered 503 for GET /repos/owner/repo/issues/7/timeline?per_page=100&page=1')
    await vi.advanceTimersByTimeAsync(getRetries * retryPauseMs)
    await failed
    expect(fetch).toHaveBeenCalledTimes(1 + getRetries)
  })

  it('never asks a write again', async () => {
    const fetch = answer(502)
    vi.stubGlobal('fetch', fetch)
    await expect(gitHub('token', 'owner/repo').comment(7, 'body')).rejects.toThrow('GitHub answered 502')
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('does not ask again on a client error', async () => {
    const fetch = answer(404)
    vi.stubGlobal('fetch', fetch)
    await expect(gitHub('token', 'owner/repo').role('someone')).resolves.toBe('')
    expect(fetch).toHaveBeenCalledTimes(1)
  })
})
