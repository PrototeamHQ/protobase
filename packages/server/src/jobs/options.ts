import { parseDuration } from '../files/duration'
import type { EnqueueOptions, JobOptions } from './job-types'

/** pg-boss counts in whole seconds; a duration rounds up, so a wait is never shorter than asked. */
const seconds = (value: number | string, label: string) => Math.ceil(parseDuration(value, label) / 1000)

const positive = (value: number, label: string) => {
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${label} must be a whole number of at least 1, not ${value}`)
  return value
}

export const defaultMaxAttempts = 10

/** The pg-boss queue a job definition runs in: its policy, retries with backoff and timeout. */
export const queueOptions = (options: JobOptions<unknown>) => {
  const label = `Job "${options.name}"`
  return {
    policy: options.ordered ? 'key_strict_fifo' : 'standard',
    retryLimit: positive(options.maxAttempts ?? defaultMaxAttempts, `${label} maxAttempts`) - 1,
    retryDelay: positive(seconds(options.retryDelay ?? '2s', `${label} retryDelay`), `${label} retryDelay in seconds`),
    retryBackoff: true,
    retryDelayMax: positive(seconds(options.maxRetryDelay ?? '1 hour', `${label} maxRetryDelay`), `${label} maxRetryDelay in seconds`),
    expireInSeconds: positive(seconds(options.timeout ?? '15 minutes', `${label} timeout`), `${label} timeout in seconds`),
  }
}

/** The queue settings `queueOptions` sets, as `getQueue` reads them back, so a changed definition is noticed. */
export const queueSettingsDiffer = (wanted: ReturnType<typeof queueOptions>, stored: object) =>
  (Object.keys(wanted) as Array<keyof typeof wanted>).some((key) => key !== 'policy' && (stored as Record<string, unknown>)[key] !== wanted[key])

/**
 * The pg-boss send options of one enqueue: when, how urgent, and the key a waiting job is found by. An ordered job's
 * group is its key in pg-boss, which keeps one group's jobs in order.
 */
export const sendOptions = (options: JobOptions<unknown>, enqueue: EnqueueOptions = {}) => {
  const label = `Job "${options.name}"`
  if (enqueue.runAt && enqueue.delay !== undefined) throw new Error(`${label}: pass runAt or delay, not both`)
  if (options.ordered && enqueue.group === undefined) throw new Error(`${label} is ordered: name the group each job runs in with { group }`)
  if (options.ordered && enqueue.key !== undefined) throw new Error(`${label} is ordered: its jobs are found by their group, so it takes no key`)
  if (!options.ordered && enqueue.group !== undefined) throw new Error(`${label} is not ordered: a group needs ordered: true in defineJob`)
  if (enqueue.mode && enqueue.key === undefined) throw new Error(`${label}: mode needs a key`)
  if (enqueue.priority !== undefined && !Number.isSafeInteger(enqueue.priority)) throw new Error(`${label}: priority must be a whole number`)
  const startAfter = enqueue.runAt ?? (enqueue.delay === undefined ? undefined : seconds(enqueue.delay, `${label} delay`))
  const singletonKey = options.ordered ? enqueue.group : enqueue.key
  return {
    ...(startAfter !== undefined && { startAfter }),
    ...(enqueue.priority !== undefined && { priority: enqueue.priority }),
    ...(singletonKey !== undefined && { singletonKey }),
  }
}
