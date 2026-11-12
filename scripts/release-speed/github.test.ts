import { describe, expect, it } from 'vitest'
import { GhServerError } from './gh-api'
import { counts, recentRuns, releasesMerge, runFilters } from './github'
import type { ApiJob, ApiRun } from './timings'

const run = (id: number, startedAt = '', event = 'push'): ApiRun => ({ id, event, run_started_at: startedAt, updated_at: '', html_url: '' })
const job = (name: string, conclusion: string): ApiJob => ({ name, conclusion, created_at: '', started_at: '', completed_at: '' })
const planned = [job('plan', 'success'), job('check / unit', 'success')]
const tagged = [job('plan', 'skipped'), job('pack', 'success')]

// An API with three runs whose jobs answer with `jobsOf2` for run 2.
const api = (jobsOf2: () => never) => <T>(path: string) => {
  if (path.startsWith('actions/workflows/')) return { workflow_runs: [run(1), run(2), run(3)] } as T
  if (path.startsWith('actions/runs/2/')) jobsOf2()
  return { jobs: [] } as T
}

const release = { file: 'release.yml', event: 'push', branch: 'main', targetMinutes: 10 }
const ci = { file: 'ci.yml', event: 'push', targetMinutes: 5 }
const dispatchOnMain = { event: 'repository_dispatch', branch: 'main' }
const workflowDispatchOnMain = { event: 'workflow_dispatch', branch: 'main' }

describe('runFilters', () => {
  it("takes release's push runs on main and a merge's dispatch runs on main", () => {
    expect(runFilters(release)).toEqual([{ event: 'push', branch: 'main' }, dispatchOnMain, workflowDispatchOnMain])
  })

  it("takes ci's push runs on any branch and a merge's dispatch runs on main", () => {
    expect(runFilters(ci)).toEqual([{ event: 'push', branch: undefined }, dispatchOnMain])
  })

  it('adds no dispatch runs to any other event or to pushes on another branch', () => {
    expect(runFilters({ ...ci, event: 'pull_request' })).toEqual([{ event: 'pull_request', branch: undefined }])
    expect(runFilters({ ...release, branch: 'next' })).toEqual([{ event: 'push', branch: 'next' }])
    expect(runFilters({ file: 'ci.yml', targetMinutes: 5 })).toEqual([{ event: undefined, branch: undefined }])
  })
})

describe('releasesMerge', () => {
  it('keeps a tagless workflow_dispatch, which runs plan, and leaves out one given a tag', () => {
    expect(releasesMerge(run(1, '', 'workflow_dispatch'), planned)).toBe(true)
    expect(releasesMerge(run(1, '', 'workflow_dispatch'), tagged)).toBe(false)
  })

  it('keeps every run of another event', () => {
    expect(releasesMerge(run(1, '', 'push'), [])).toBe(true)
    expect(releasesMerge(run(1, '', 'repository_dispatch'), [])).toBe(true)
  })
})

describe('counts', () => {
  const published = { ...release, until: 'npm' as const }
  const publish = (conclusion: string) => [...planned, job('publish', conclusion)]

  it('takes only the runs that published in a window clocked until npm', () => {
    expect(counts(published, run(1), publish('success'))).toBe(true)
    expect(counts(published, run(1), publish('skipped'))).toBe(false)
    expect(counts(published, run(1, '', 'workflow_dispatch'), [...tagged, job('publish', 'success')])).toBe(false)
  })

  it('takes a run that published nothing in any other window', () => {
    expect(counts(release, run(1), publish('skipped'))).toBe(true)
  })
})

describe('recentRuns', () => {
  it('fills a window clocked until npm past the runs that published nothing, from a full page', () => {
    const paths: string[] = []
    const get = <T>(path: string) => {
      paths.push(path)
      if (path.includes('event=push')) return { workflow_runs: [run(3, '2026-11-02T12:30:00Z'), run(2, '2026-11-02T12:20:00Z'), run(1, '2026-11-02T12:10:00Z')] } as T
      if (path.startsWith('actions/workflows/')) return { workflow_runs: [] } as T
      if (path.startsWith('actions/runs/2/')) return { jobs: [job('publish', 'skipped')] } as T
      return { jobs: [job('publish', 'success')] } as T
    }
    expect(recentRuns({ ...release, until: 'npm' }, 2, get).map(({ run }) => run.id)).toEqual([3, 1])
    expect(paths[0]).toContain('per_page=100')
  })

  it('takes the tagless workflow_dispatch runs on main and fills the window past one given a tag', () => {
    const at = (minute: number) => `2026-11-02T12:${String(minute).padStart(2, '0')}:00Z`
    const get = <T>(path: string) => {
      if (path.includes('event=push')) return { workflow_runs: [run(2, at(20))] } as T
      if (path.includes('event=repository_dispatch')) return { workflow_runs: [] } as T
      if (path.includes('event=workflow_dispatch&branch=main')) {
        return { workflow_runs: [run(4, at(40), 'workflow_dispatch'), run(3, at(30), 'workflow_dispatch'), run(1, at(10), 'workflow_dispatch')] } as T
      }
      if (path.startsWith('actions/runs/3/')) return { jobs: tagged } as T
      if (path.startsWith('actions/runs/')) return { jobs: planned } as T
      throw new Error(`unexpected ${path}`)
    }
    expect(recentRuns(release, 2, get).map(({ run }) => run.id)).toEqual([4, 2])
  })

  it('merges the push and dispatch runs newest first, up to the window', () => {
    const at = (minute: number) => `2026-11-02T12:${String(minute).padStart(2, '0')}:00Z`
    const get = <T>(path: string) => {
      if (path.includes('event=push')) return { workflow_runs: [run(4, at(40)), run(2, at(20))] } as T
      if (path.includes('event=repository_dispatch&branch=main')) return { workflow_runs: [run(3, at(30)), run(1, at(10))] } as T
      if (path.includes('event=workflow_dispatch')) return { workflow_runs: [] } as T
      if (path.startsWith('actions/runs/')) return { jobs: [] } as T
      throw new Error(`unexpected ${path}`)
    }
    expect(recentRuns(release, 3, get).map(({ run }) => run.id)).toEqual([4, 3, 2])
  })

  it('leaves out a run whose jobs GitHub keeps answering with a 5xx', () => {
    const get = api(() => {
      throw new GhServerError('gh: Server Error (HTTP 502)')
    })
    expect(recentRuns({ file: 'release.yml', targetMinutes: 10 }, 3, get).map(({ run }) => run.id)).toEqual([1, 3])
  })

  it('fails on any other error', () => {
    const get = api(() => {
      throw new Error('gh: Not Found (HTTP 404)')
    })
    expect(() => recentRuns({ file: 'release.yml', targetMinutes: 10 }, 3, get)).toThrow('Not Found (HTTP 404)')
  })
})
