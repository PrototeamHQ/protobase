import { describe, expect, it } from 'vitest'
import { report, workflowReport, type WorkflowConfig } from './report'
import { describeVerdict, formatDuration, judge, percentile, summarize } from './stats'
import { runTimings, type ApiJob, type ApiRun } from './timings'

// A run started at 12:00:00 that took `wallMinutes`, with a check job queued for `queueSeconds` and a skipped job.
const fixture = (id: number, wallMinutes: number, queueSeconds: number) => {
  const start = Date.parse('2026-10-17T12:00:00Z')
  const at = (seconds: number) => new Date(start + seconds * 1000).toISOString()
  const run: ApiRun = { id, event: 'push', run_started_at: at(0), updated_at: at(wallMinutes * 60), html_url: `https://example.com/runs/${id}` }
  const jobs: ApiJob[] = [
    { name: 'check', conclusion: 'success', created_at: at(0), started_at: at(queueSeconds), completed_at: at(wallMinutes * 60) },
    { name: 'publish', conclusion: 'skipped', created_at: at(0), started_at: at(0), completed_at: at(0) },
  ]
  return runTimings(run, jobs)
}

describe('percentile', () => {
  it('takes the nearest rank, whatever the order', () => {
    const values = [5, 1, 4, 2, 3, 10, 9, 8, 7, 6]
    expect(percentile(values, 50)).toBe(5)
    expect(percentile(values, 90)).toBe(9)
    expect(percentile(values, 100)).toBe(10)
    expect(percentile([7], 90)).toBe(7)
  })

  it('throws without values', () => {
    expect(() => percentile([], 50)).toThrow('no values')
  })

  it('summarizes newest first, so latest is the first value', () => {
    expect(summarize([300, 100, 200])).toEqual({ p50: 200, p90: 300, latest: 300, count: 3 })
  })
})

describe('the target', () => {
  it('is met at or under it, with the margin under', () => {
    expect(judge(540, 600)).toEqual({ met: true, margin: 60 })
    expect(judge(600, 600)).toEqual({ met: true, margin: 0 })
  })

  it('is not met over it, with the margin over', () => {
    expect(judge(850, 600)).toEqual({ met: false, margin: 250 })
    expect(describeVerdict('release', 850, 600)).toBe('release p50 14m10s vs target 10m: not met, 4m10s over')
    expect(describeVerdict('ci', 245, 300)).toBe('ci p50 4m05s vs target 5m: met, 55s under')
  })

  it('formats whole seconds and minutes', () => {
    expect(formatDuration(0)).toBe('0s')
    expect(formatDuration(45.4)).toBe('45s')
    expect(formatDuration(600)).toBe('10m')
    expect(formatDuration(3725)).toBe('62m05s')
  })
})

describe('runTimings', () => {
  it('splits the queue from the run and leaves out skipped jobs', () => {
    const timings = fixture(1, 10, 90)
    expect(timings).toMatchObject({ wall: 600, queue: 90, run: 510 })
    expect([...timings.jobs]).toEqual([['check', { wall: 600, queue: 90, run: 510 }]])
  })
})

describe('runTimings of a release run that starts the report', () => {
  const start = Date.parse('2026-11-03T12:00:00Z')
  const at = (seconds: number) => new Date(start + seconds * 1000).toISOString()
  const job = (name: string, from: number, to: number, conclusion = 'success'): ApiJob => ({ name, conclusion, created_at: at(from), started_at: at(from), completed_at: at(to) })
  const run: ApiRun = { id: 1, event: 'workflow_dispatch', run_started_at: at(0), updated_at: at(780), html_url: '' }

  it('ends at its last other job, whatever that job concluded, and leaves the report job out', () => {
    const timings = runTimings(run, [job('plan', 0, 60), job('bump', 60, 540, 'skipped'), job('publish', 60, 480), job('release-speed', 600, 780)])
    expect(timings).toMatchObject({ wall: 540, queue: 0, run: 540 })
    expect([...timings.jobs.keys()]).toEqual(['plan', 'publish'])
  })

  it('ends at updated_at without a report job, as earlier runs did', () => {
    expect(runTimings(run, [job('plan', 0, 60), job('publish', 60, 480)])).toMatchObject({ wall: 780 })
  })
})

describe('report', () => {
  const release: WorkflowConfig = { file: 'release.yml', event: 'push', branch: 'main', targetMinutes: 10 }

  it('gives the verdict and the p50, p90 and latest of the workflow and each job', () => {
    const runs = [fixture(3, 12, 0), fixture(2, 8, 60), fixture(1, 16, 0)]
    const markdown = workflowReport(release, runs)
    expect(markdown).toContain('**release p50 12m vs target 10m: not met, 2m over**')
    expect(markdown).toContain('3 successful push runs on main, repository_dispatch runs on main, and workflow_dispatch runs on main, the newest [3](https://example.com/runs/3)')
    expect(markdown).toContain('| **workflow** | 3 | 12m · 16m · 12m | 0s · 1m · 0s | 12m · 16m · 12m |')
    expect(markdown).toContain('| check | 3 | 12m · 16m · 12m | 0s · 1m · 0s | 12m · 16m · 12m |')
    expect(markdown).not.toContain('publish')
  })

  it('names push runs on any branch and the dispatch runs on main in a ci window', () => {
    const ci: WorkflowConfig = { file: 'ci.yml', event: 'push', targetMinutes: 5 }
    expect(workflowReport(ci, [fixture(1, 4, 0)])).toContain('1 successful push runs on any branch and repository_dispatch runs on main, the newest')
  })

  it('names only the push runs of a window on another branch', () => {
    const next: WorkflowConfig = { file: 'release.yml', event: 'push', branch: 'next', targetMinutes: 10 }
    expect(workflowReport(next, [fixture(1, 8, 0)])).toContain('1 successful push runs on next, the newest')
  })

  it('names a window clocked until npm and prints the images beside their guardrail', () => {
    const published: WorkflowConfig = { ...release, until: 'npm', imagesGuardrailMinutes: 10.75 }
    const runs = [{ ...fixture(2, 10, 0), images: 594 }, { ...fixture(1, 11, 0), images: 660 }]
    const markdown = workflowReport(published, runs)
    expect(markdown).toContain('**release p50 10m vs target 10m: met, 0s under**')
    expect(markdown).toContain('and workflow_dispatch runs on main that published, each from its start until npm serves the packages, the newest [2]')
    expect(markdown).toContain("Images, from a run's first job to its last: 9m54s · 11m · 9m54s, guardrail 10m45s.")
    expect(workflowReport(release, runs)).not.toContain('Images')
  })

  it('says when there are no runs to measure', () => {
    const ci: WorkflowConfig = { file: 'ci.yml', targetMinutes: 5 }
    expect(report({ window: 20, workflows: [ci] }, [[]])).toContain('No successful runs on any branch to measure against the target of 5m.')
  })
})
