import { parseDuration } from '../files/duration'

/**
 * The time a derived value's compute function reads: each check records the next moment its answer flips, and the
 * value is computed again then. `now()` records nothing, so a value that shows the time itself is not kept current.
 */
export type DerivedClock = {
  /** The moment the function runs. */
  now: () => Date
  /** Whether `at` has come. */
  isPast: (at: Date | string) => boolean
  /** Whether more than `duration` (milliseconds, or text such as `2 hours`) has passed since `at`. */
  olderThan: (at: Date | string, duration: number | string) => boolean
}

/** A clock at `now`, and the earliest moment one of its checks flips, `undefined` while none will. */
export const trackedClock = (now: Date) => {
  let flipsAt: Date | undefined
  const isPast = (at: Date | string) => {
    const moment = new Date(at)
    if (Number.isNaN(moment.getTime())) throw new Error(`The clock cannot check "${String(at)}", which is not a time`)
    if (moment > now && (!flipsAt || moment < flipsAt)) flipsAt = moment
    return moment <= now
  }
  const clock: DerivedClock = {
    now: () => new Date(now),
    isPast,
    olderThan: (at, duration) => isPast(new Date(new Date(at).getTime() + parseDuration(duration, 'olderThan'))),
  }
  return { clock, flipsAt: () => flipsAt }
}
