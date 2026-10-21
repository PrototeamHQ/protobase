import { describe, expect, it } from 'vitest'
import { ghApi, retryDelays, type Gh } from './gh-api'

// A gh that gives each response in turn and records the waits between them.
const scripted = (...responses: Array<{ status: number; stdout?: string; stderr?: string }>) => {
  const waits: number[] = []
  let calls = 0
  const run: Gh = () => ({ stdout: '', stderr: '', ...responses[calls++]! })
  return { run, wait: (ms: number) => waits.push(ms), waits, calls: () => calls }
}

describe('ghApi', () => {
  it('gives the parsed response', () => {
    const gh = scripted({ status: 0, stdout: '{"jobs":[]}' })
    expect(ghApi('actions/runs/1/jobs', gh.run, gh.wait)).toEqual({ jobs: [] })
    expect(gh.waits).toEqual([])
  })

  it('asks again after a short wait when GitHub answers with a 5xx', () => {
    const gh = scripted({ status: 1, stderr: 'gh: Server Error (HTTP 502)' }, { status: 1, stderr: 'gh: Service Unavailable (HTTP 503)' }, { status: 0, stdout: '{"jobs":[]}' })
    expect(ghApi('actions/runs/1/jobs', gh.run, gh.wait)).toEqual({ jobs: [] })
    expect(gh.waits).toEqual(retryDelays.slice(0, 2))
  })

  it('fails once every wait is used up', () => {
    const gh = scripted(...Array.from({ length: retryDelays.length + 1 }, () => ({ status: 1, stderr: 'gh: Server Error (HTTP 502)' })))
    expect(() => ghApi('actions/runs/1/jobs', gh.run, gh.wait)).toThrow('gh api actions/runs/1/jobs failed with status 1: gh: Server Error (HTTP 502)')
    expect(gh.calls()).toBe(retryDelays.length + 1)
    expect(gh.waits).toEqual(retryDelays)
  })

  it('fails at once on any other error', () => {
    const gh = scripted({ status: 1, stderr: 'gh: Not Found (HTTP 404)' })
    expect(() => ghApi('actions/runs/1/jobs', gh.run, gh.wait)).toThrow('Not Found (HTTP 404)')
    expect(gh.waits).toEqual([])
  })
})
