import { createHash } from 'node:crypto'
import { CronExpressionParser } from 'cron-parser'

/**
 * The key every run of a recurring job waits under. Each run is a job of its own, enqueued for its time: it is what
 * `jobs.next_due()` sees while the app sleeps, so a host that wakes the app for due jobs wakes it for these too.
 */
export const scheduleKey = 'protobase.schedule'

/** The first run of `schedule` strictly after `after`, in `timezone`; throws on an expression cron-parser refuses. */
export const nextRun = (schedule: string, timezone: string, after: Date) =>
  CronExpressionParser.parse(schedule, { currentDate: after, tz: timezone }).next().toDate()

/** Whether `at` is a run of `schedule`, so a run left from an earlier schedule can be told apart. */
export const isRun = (schedule: string, timezone: string, at: Date) => nextRun(schedule, timezone, new Date(at.getTime() - 1)).getTime() === at.getTime()

/**
 * The id of the run of job `name` at `at`: the same in every process, so however many workers enqueue a run, the
 * database keeps one (its primary key), and the run happens once.
 */
export const runId = (name: string, at: Date) => {
  const hex = createHash('sha256').update(`${name}@${at.toISOString()}`).digest('hex')
  // Laid out as a version 8 UUID, the version for ids made by the application's own scheme.
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-8${hex.slice(13, 16)}-${((parseInt(hex[16]!, 16) & 0x3) | 0x8).toString(16)}${hex.slice(17, 20)}-${hex.slice(20, 32)}`
}
