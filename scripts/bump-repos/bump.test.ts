import { afterEach, describe, expect, it, vi } from 'vitest'
import { bumpRepos } from './bump'
import type { Run } from './dispatch'

const ok = { error: undefined, status: 0, stderr: '' }
const repos = '[{ "repo": "acme/console" }, { "repo": "acme/api" }]'

describe('bumpRepos', () => {
  afterEach(() => vi.restoreAllMocks())

  it('bumps nothing and warns about nothing when no repositories are listed', () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const run = vi.fn<Run>(() => ok)
    const warn = vi.fn()
    bumpRepos({ tag: 'v0.66.6', token: 'token' }, run, warn)
    expect(run).not.toHaveBeenCalled()
    expect(warn).not.toHaveBeenCalled()
  })

  it('passes with a warning naming the missing secret when the token is not set', () => {
    const run = vi.fn<Run>(() => ok)
    const warn = vi.fn()
    bumpRepos({ tag: 'v0.66.6', repos, token: '' }, run, warn)
    expect(run).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalledWith('The PROTOBASE_BUMP_TOKEN secret is not set, so 2 repositories of PROTOBASE_BUMP_REPOS were not bumped to 0.66.6')
  })

  it('starts every repository when both are set', () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const run = vi.fn<Run>(() => ok)
    const warn = vi.fn()
    bumpRepos({ tag: 'v0.66.6', repos, token: 'token' }, run, warn)
    expect(run).toHaveBeenCalledTimes(2)
    expect(warn).not.toHaveBeenCalled()
  })

  it('fails when a repository cannot be started', () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const run = vi.fn<Run>(() => ({ error: undefined, status: 1, stderr: 'HTTP 404' }))
    expect(() => bumpRepos({ tag: 'v0.66.6', repos, token: 'token' }, run, vi.fn())).toThrow('2 of 2 repositories could not start their bump to 0.66.6')
  })

  it('refuses a tag that is not a release tag', () => {
    expect(() => bumpRepos({ tag: '0.66.6', repos, token: 'token' }, vi.fn<Run>(), vi.fn())).toThrow('TAG is not a release tag such as v0.66.6')
  })
})
