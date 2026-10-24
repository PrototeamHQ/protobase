import { describe, expect, it } from 'vitest'
import { GhServerError } from './gh-api'
import { recentRuns } from './github'
import type { ApiRun } from './timings'

const run = (id: number): ApiRun => ({ id, run_started_at: '', updated_at: '', html_url: '' })

// An API with three runs whose jobs answer with `jobsOf2` for run 2.
const api = (jobsOf2: () => never) => <T>(path: string) => {
  if (path.startsWith('actions/workflows/')) return { workflow_runs: [run(1), run(2), run(3)] } as T
  if (path.startsWith('actions/runs/2/')) jobsOf2()
  return { jobs: [] } as T
}

describe('recentRuns', () => {
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
