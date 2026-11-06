import type { PollEvery, PollingTrigger } from '@protobase/workflows/plugin'
import { parseDuration } from '../../files/duration'
import { nextRun } from '../../jobs/schedule'

/** The shortest time between two polls, whatever a plugin's `every` says. */
const shortestMs = 1_000

/** The longest wait a failing trigger's backoff reaches. */
const longestBackoffMs = 3_600_000

/** The base of a cron trigger's backoff, which has no interval of its own. */
const cronBackoffMs = 60_000

/** How often a polling trigger polls for this input. */
export const pollEvery = (type: PollingTrigger, input: Record<string, unknown>): PollEvery => (typeof type.every === 'function' ? type.every(input) : type.every)

/** The time of the poll after one due at `after`: an interval later, or the cron's next time. */
export const nextPollAt = (every: PollEvery, after: Date) => {
  if (typeof every === 'string') return new Date(after.getTime() + Math.max(parseDuration(every, 'every'), shortestMs))
  return nextRun(every.cron, every.timezone ?? 'UTC', after)
}

/** The first poll of a trigger that starts at `now`: at once on an interval, at the cron's next time otherwise. */
export const firstPollAt = (every: PollEvery, now: Date) => (typeof every === 'string' ? now : nextRun(every.cron, every.timezone ?? 'UTC', now))

/**
 * When a trigger that failed `failures` times in a row polls again: `every × 2^failures`, at most an hour and never
 * sooner than its interval; a cron trigger at its first time after a minute × 2^failures, at most an hour, from now.
 */
export const backoffPollAt = (every: PollEvery, failures: number, now: Date) => {
  const factor = 2 ** Math.min(failures, 20)
  if (typeof every === 'string') {
    const interval = Math.max(parseDuration(every, 'every'), shortestMs)
    return new Date(now.getTime() + Math.max(interval, Math.min(interval * factor, longestBackoffMs)))
  }
  return nextRun(every.cron, every.timezone ?? 'UTC', new Date(now.getTime() + Math.min(cronBackoffMs * factor, longestBackoffMs)))
}
