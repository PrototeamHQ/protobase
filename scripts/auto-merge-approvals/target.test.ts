import { describe, expect, it } from 'vitest'
import { eventTarget, pullsOfCommit } from './target'

describe('eventTarget', () => {
  it('takes the pull request of a review or label event and the commit of the others', () => {
    expect(eventTarget('pull_request_review', { pull_request: { number: 7 } })).toEqual({ number: 7 })
    expect(eventTarget('pull_request_target', { pull_request: { number: 7 } })).toEqual({ number: 7 })
    expect(eventTarget('workflow_run', { workflow_run: { head_sha: 'a' } })).toEqual({ sha: 'a' })
    expect(eventTarget('check_suite', { check_suite: { head_sha: 'a' } })).toEqual({ sha: 'a' })
    expect(eventTarget('status', { sha: 'a' })).toEqual({ sha: 'a' })
  })

  it('throws on any other event', () => {
    expect(() => eventTarget('push', {})).toThrow('push')
  })
})

describe('pullsOfCommit', () => {
  const pull = { number: 1, state: 'open', head: { sha: 'a', repo: { full_name: 'owner/repo' } } }

  it('takes open pull requests whose head is the commit, in this repository', () => {
    const pulls = [
      pull,
      { ...pull, number: 2, state: 'closed' },
      { ...pull, number: 3, head: { ...pull.head, sha: 'b' } },
      { ...pull, number: 4, head: { sha: 'a', repo: { full_name: 'someone/repo' } } },
      { ...pull, number: 5, head: { sha: 'a', repo: null } },
    ]
    expect(pullsOfCommit(pulls, 'a', 'owner/repo')).toEqual([1])
  })
})
