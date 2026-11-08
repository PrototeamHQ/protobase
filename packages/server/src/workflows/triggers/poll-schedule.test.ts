import { describe, expect, it } from 'vitest'
import { backoffPollAt, firstPollAt, nextPollAt } from './poll-schedule'

const at = new Date('2026-11-05T10:00:00Z')
const plus = (ms: number) => new Date(at.getTime() + ms).toISOString()

describe('poll times', () => {
  it('polls an interval later, or at the next time of a cron in its time zone', () => {
    expect(nextPollAt('5 minutes', at).toISOString()).toBe(plus(300_000))
    expect(nextPollAt({ cron: '0 6 * * *', timezone: 'Europe/Amsterdam' }, at).toISOString()).toBe('2026-11-06T05:00:00.000Z')
    expect(firstPollAt('5 minutes', at)).toEqual(at)
    expect(firstPollAt({ cron: '30 10 * * *' }, at).toISOString()).toBe('2026-11-05T10:30:00.000Z')
  })

  it('never polls more often than once a second', () => {
    expect(nextPollAt('0', at).toISOString()).toBe(plus(1_000))
  })

  it('backs off as every × 2^n, at most an hour, never sooner than its interval', () => {
    expect(backoffPollAt('1 minute', 1, at).toISOString()).toBe(plus(120_000))
    expect(backoffPollAt('1 minute', 3, at).toISOString()).toBe(plus(480_000))
    expect(backoffPollAt('1 minute', 10, at).toISOString()).toBe(plus(3_600_000))
    expect(backoffPollAt('2 hours', 1, at).toISOString()).toBe(plus(7_200_000))
    expect(backoffPollAt({ cron: '* * * * *' }, 2, at).toISOString()).toBe(plus(300_000))
  })
})
