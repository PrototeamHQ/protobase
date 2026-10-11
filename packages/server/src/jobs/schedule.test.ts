import { describe, expect, it } from 'vitest'
import { defineJob } from './define-job'
import { isRun, nextRun, runId } from './schedule'

const at = (iso: string) => new Date(iso)

describe('nextRun', () => {
  it('is the first time strictly after the one given, in the schedule\'s time zone', () => {
    expect(nextRun('0 7 * * *', 'UTC', at('2026-10-11T06:59:59Z'))).toEqual(at('2026-10-11T07:00:00Z'))
    expect(nextRun('0 7 * * *', 'UTC', at('2026-10-11T07:00:00Z'))).toEqual(at('2026-10-12T07:00:00Z'))
    expect(nextRun('0 7 * * *', 'Europe/Amsterdam', at('2026-10-11T06:00:00Z'))).toEqual(at('2026-10-12T05:00:00Z'))
    // The night clocks go back in Amsterdam: 07:00 is an hour later in UTC from then on.
    expect(nextRun('0 7 * * *', 'Europe/Amsterdam', at('2026-10-25T00:00:00Z'))).toEqual(at('2026-10-25T06:00:00Z'))
    expect(nextRun('*/30 * * * * *', 'UTC', at('2026-10-11T07:00:10Z'))).toEqual(at('2026-10-11T07:00:30Z'))
  })
})

describe('isRun', () => {
  it('tells a time of the schedule from one of another schedule', () => {
    expect(isRun('0 7 * * *', 'UTC', at('2026-10-12T07:00:00Z'))).toBe(true)
    expect(isRun('0 8 * * *', 'UTC', at('2026-10-12T07:00:00Z'))).toBe(false)
    expect(isRun('0 7 * * *', 'Europe/Amsterdam', at('2026-10-12T07:00:00Z'))).toBe(false)
  })
})

describe('runId', () => {
  it('is one UUID per job and time, the same in every process', () => {
    const id = runId('nightly', at('2026-10-12T07:00:00Z'))
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    expect(runId('nightly', at('2026-10-12T07:00:00Z'))).toBe(id)
    expect(runId('nightly', at('2026-10-13T07:00:00Z'))).not.toBe(id)
    expect(runId('weekly', at('2026-10-12T07:00:00Z'))).not.toBe(id)
  })
})

describe('a recurring job', () => {
  it('refuses a schedule or time zone cron cannot read', () => {
    expect(() => defineJob({ name: 'nightly', schedule: 'every night', run: () => {} })).toThrow('Job "nightly" has the schedule "every night" in UTC, which is not a cron schedule there')
    expect(() => defineJob({ name: 'nightly', schedule: '0 7 * * *', timezone: 'Mars/Olympus', run: () => {} })).toThrow('in Mars/Olympus, which is not a cron schedule there')
  })
})
