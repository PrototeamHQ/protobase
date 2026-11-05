import { describe, expect, it } from 'vitest'
import { scheduleTriggers } from './schedule'

const schedule = scheduleTriggers.schedule!

describe('app:schedule', () => {
  it('refuses a cron that is not five fields, and a time zone that is not IANA', () => {
    expect(schedule.check!({ cron: '0 6 * * 1-5', timezone: 'Europe/Amsterdam' })).toEqual([])
    expect(schedule.check!({ cron: '0 6 * *' })).toEqual([{ field: 'cron', message: 'must be a cron of 5 fields, such as 0 6 * * *' }])
    expect(schedule.check!({ cron: '0 6 * * *', timezone: 'Mars/Olympus' })).toEqual([{ field: 'timezone', message: '"Mars/Olympus" is not an IANA time zone, such as Europe/Amsterdam' }])
  })

  it('polls on its own cron and gives the time it was due, keyed by that time', async () => {
    expect(schedule.every).toBeTypeOf('function')
    expect((schedule.every as (input: Record<string, unknown>) => unknown)({ cron: '0 6 * * *', timezone: 'Europe/Amsterdam' })).toEqual({ cron: '0 6 * * *', timezone: 'Europe/Amsterdam' })
    const due = new Date('2026-11-05T05:00:00Z')
    const result = await schedule.poll({ due, cursor: null, store: null, limit: 1, input: {}, connection: undefined, fetch: () => Promise.reject(new Error('no fetch')), signal: new AbortController().signal })
    expect(result).toEqual({ items: [{ key: 'schedule:2026-11-05T05:00:00.000Z', data: { scheduled_at: '2026-11-05T05:00:00.000Z' } }], cursor: '2026-11-05T05:00:00.000Z' })
  })
})
