import { describe, expect, it } from 'vitest'
import { GhServerError } from './gh-api'
import { recentRuns, runFilters } from './github'
import type { ApiRun } from './timings'

const run = (id: number, startedAt = ''): ApiRun => ({ id, run_started_at: startedAt, updated_at: '', html_url: '' })

// An API with three runs whose jobs answer with `jobsOf2` for run 2.
const api = (jobsOf2: () => never) => <T>(path: string) => {
  if (path.startsWith('actions/workflows/')) return { workflow_runs: [run(1), run(2), run(3)] } as T
  if (path.startsWith('actions/runs/2/')) jobsOf2()
  return { jobs: [] } as T
}

const release = { file: 'release.yml', event: 'push', branch: 'main', targetMinutes: 10 }
const ci = { file: 'ci.yml', event: 'push', targetMinutes: 5 }
const dispatchOnMain = { event: 'repository_dispatch', branch: 'main' }

describe('runFilters', () => {
  it("takes release's push runs on main and a merge's dispatch runs on main", () => {
    expect(runFilters(release)).toEqual([{ event: 'push', branch: 'main' }, dispatchOnMain])
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

describe('recentRuns', () => {
  it('merges the push and dispatch runs newest first, up to the window', () => {
    const at = (minute: number) => `2026-11-02T12:${String(minute).padStart(2, '0')}:00Z`
    const get = <T>(path: string) => {
      if (path.includes('event=push')) return { workflow_runs: [run(4, at(40)), run(2, at(20))] } as T
      if (path.includes('event=repository_dispatch&branch=main')) return { workflow_runs: [run(3, at(30)), run(1, at(10))] } as T
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
