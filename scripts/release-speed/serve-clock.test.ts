import { describe, expect, it } from 'vitest'
import { npmWaitStep, published, serveTimings } from './serve-clock'
import type { ApiJob, ApiRun } from './timings'

const start = Date.parse('2026-11-09T19:56:00Z')
const at = (seconds: number) => new Date(start + seconds * 1000).toISOString()
const job = (name: string, from: number, to: number, conclusion = 'success'): ApiJob => ({ name, conclusion, created_at: at(from), started_at: at(from), completed_at: at(to) })
const leg = (name: string, from: number, waitEnd: number, to: number): ApiJob => ({
  ...job(name, from, to),
  steps: [
    { name: 'Set up job', conclusion: 'success', completed_at: at(from + 5) },
    { name: npmWaitStep, conclusion: 'success', completed_at: at(waitEnd) },
  ],
})
const run: ApiRun = { id: 7, event: 'push', run_started_at: at(0), updated_at: at(740), html_url: '' }

// A release that waited 20s for its concurrency group, published at 6m40s and whose images ended at 12m.
const jobs = [
  job('plan', 20, 40),
  job('check / check', 20, 300),
  job('publish', 380, 400),
  { ...job('bump', 400, 650), steps: [{ name: npmWaitStep, conclusion: 'success', completed_at: at(560) }] },
  leg('image / build (linux/amd64, ubuntu-latest)', 400, 640, 690),
  leg('image-dev / build (linux/arm64, ubuntu-24.04-arm)', 400, 620, 700),
  job('image / manifest', 690, 720),
  job('release-speed', 721, 730),
]

describe('published', () => {
  it('holds when the publish job succeeded', () => {
    expect(published(jobs)).toBe(true)
    expect(published([job('publish', 0, 10, 'skipped')])).toBe(false)
    expect(published([job('plan', 0, 10)])).toBe(false)
  })
})

describe('serveTimings', () => {
  it("ends at the earliest image leg's npm wait, not the bump's, and times the images first job to last", () => {
    expect(serveTimings(run, jobs)).toMatchObject({ wall: 620, queue: 20, run: 600, images: 700 })
  })

  it('fails on a run that published without a completed npm wait in an image leg', () => {
    const skipped = jobs.map((j) => (j.name.startsWith('image') ? { ...j, conclusion: 'skipped', steps: [] } : j))
    expect(() => serveTimings(run, skipped)).toThrow(`release run 7 published, but no image leg completed its "${npmWaitStep}" step`)
    const failed = jobs.map((j) => (j.steps && j.name.startsWith('image') ? { ...j, steps: j.steps.map((s) => ({ ...s, conclusion: 'failure' })) } : j))
    expect(() => serveTimings(run, failed)).toThrow('no image leg completed')
  })
})
