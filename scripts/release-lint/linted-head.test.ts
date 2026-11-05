import { describe, expect, it } from 'vitest'
import type { Api } from '../release-speed/github'
import { lintedHead } from './linted-head'

// An Actions API with the given runs, newest first, and each run's commits job conclusion, or no commits job.
const actions = (runs: Array<{ id: number; head_sha: string; commits?: string | null }>) => {
  const paths: string[] = []
  const get = ((path: string) => {
    paths.push(path)
    if (path.startsWith('actions/workflows/')) return { workflow_runs: runs }
    const run = runs.find((candidate) => path === `actions/runs/${candidate.id}/jobs?per_page=100`)
    if (!run) throw new Error(`Unexpected path ${path}`)
    const commits = run.commits === undefined ? [] : [{ name: 'commits', conclusion: run.commits }]
    return { jobs: [{ name: 'plan', conclusion: 'success' }, ...commits] }
  }) as Api
  return { get, paths }
}

describe('lintedHead', () => {
  it('gives the head of the previous run whose lint failed, so its commits are not linted again', () => {
    const { get } = actions([
      { id: 3, head_sha: 'c', commits: 'failure' },
      { id: 2, head_sha: 'b', commits: 'success' },
    ])
    expect(lintedHead(4, get)).toBe('c')
  })

  it('leaves out the running run, so a re-run lints its commits again', () => {
    const { get } = actions([
      { id: 3, head_sha: 'c', commits: 'failure' },
      { id: 2, head_sha: 'b', commits: 'success' },
    ])
    expect(lintedHead(3, get)).toBe('b')
  })

  it('skips runs whose commits job was skipped, cancelled or absent', () => {
    const { get } = actions([
      { id: 5, head_sha: 'e', commits: 'skipped' },
      { id: 4, head_sha: 'd', commits: 'cancelled' },
      { id: 3, head_sha: 'c' },
      { id: 2, head_sha: 'b', commits: 'success' },
    ])
    expect(lintedHead(6, get)).toBe('b')
  })

  it('gives nothing when no recent run linted', () => {
    const { get } = actions([{ id: 2, head_sha: 'b', commits: 'skipped' }])
    expect(lintedHead(3, get)).toBeUndefined()
  })

  it('asks only for main runs that completed and stops at the first that linted', () => {
    const { get, paths } = actions([
      { id: 3, head_sha: 'c', commits: 'success' },
      { id: 2, head_sha: 'b', commits: 'success' },
    ])
    lintedHead(4, get)
    expect(paths).toEqual(['actions/workflows/release.yml/runs?branch=main&status=completed&per_page=20', 'actions/runs/3/jobs?per_page=100'])
  })
})
