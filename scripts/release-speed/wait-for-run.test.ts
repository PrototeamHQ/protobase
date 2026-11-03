import { describe, expect, it } from 'vitest'
import type { Api } from './github'
import { interval, limit, waitForRun } from './wait-for-run'

// An API whose run answers with each status in turn, then keeps the last.
const statuses = (...answers: string[]) => {
  const paths: string[] = []
  const get = (<T>(path: string) => {
    paths.push(path)
    return { status: answers[Math.min(paths.length, answers.length) - 1] } as T
  }) as Api
  return { get, paths }
}

describe('waitForRun', () => {
  it('asks every interval until the run has completed', () => {
    const api = statuses('in_progress', 'in_progress', 'completed')
    const waits: number[] = []
    expect(waitForRun('41615098753', api.get, (ms) => waits.push(ms))).toBe(true)
    expect(api.paths).toEqual(Array(3).fill('actions/runs/41615098753'))
    expect(waits).toEqual([interval, interval])
  })

  it('gives up once the limit has passed', () => {
    const api = statuses('in_progress')
    const waits: number[] = []
    expect(waitForRun('1', api.get, (ms) => waits.push(ms))).toBe(false)
    expect(waits.length * interval).toBe(limit)
  })

  it('takes only a run id', () => {
    expect(() => waitForRun('1/../../x', statuses('completed').get, () => {})).toThrow('RELEASE_RUN must be a run id')
  })
})
