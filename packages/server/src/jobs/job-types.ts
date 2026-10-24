import type { Db } from '@protobase/query'
import type { StandardSchema } from '../functions/read-json'
import type { Mailer } from '../mail/smtp-mailer'
import type { SendNotification } from '../notifications/send-input'

/** What `run` gets beside the payload. */
export type JobContext = {
  /** The database pool. The enqueuer's transaction has committed by the time a job runs. */
  db: Db
  /** The job, and when this try took it: each try takes it at a new time. */
  job: { id: string; name: string; attempt: number; maxAttempts: number; startedOn: Date }
  /** Aborted when the job's timeout passes, or when the worker shuts down and its grace period ends. */
  signal: AbortSignal
  /** Sends mail through the app's SMTP server (`PROTOBASE_SMTP_URL`, `PROTOBASE_MAIL_FROM`); `undefined` when the app has no mail. */
  mail?: Mailer
  /** Sends a notification as `sendNotification` does; `undefined` when the app has no `notifications()`. */
  sendNotification?: SendNotification
}

export type JobOptions<Payload> = {
  /** Letters, digits, `_`, `-`, `.` and `/`; the job's queue in the `jobs` schema. */
  name: string
  /** Checks the payload when it is enqueued and again before it runs, such as a zod schema. */
  payload?: StandardSchema<Payload>
  run: (payload: Payload, context: JobContext) => Promise<void> | void
  /** Tries before the job is kept as failed, listed in the admin app. Default 10. */
  maxAttempts?: number
  /** The wait before the first retry, doubling with each one: milliseconds or text such as `30 seconds`. Default `2s`. */
  retryDelay?: number | string
  /** The longest wait between two tries. Default `1 hour`. */
  maxRetryDelay?: number | string
  /** How long one try may run before it counts as failed. Default `15 minutes`. */
  timeout?: number | string
  /**
   * Its queries through `db` may run up to 30 seconds instead of the database's own limit, on a connection kept for
   * such work: for imports, backfills, large deletes and other bulk work.
   */
  longQueries?: boolean
  /** Jobs of this name running at once in each worker process. Default 1. */
  concurrency?: number
  /**
   * Jobs run one at a time per group, in the order they were enqueued, and every enqueue names its group. A job that is
   * retrying or failed holds back the rest of its group until it succeeds, or is retried or deleted in the admin app.
   */
  ordered?: boolean
  /**
   * Runs the job on this cron schedule, such as `0 7 * * *` (with an optional seconds field first), with no payload: one
   * run per time, however many workers run. A run missed while no worker ran happens once, as soon as one does.
   */
  schedule?: string
  /** The time zone `schedule` is read in, such as `Europe/Amsterdam`. Default `UTC`. */
  timezone?: string
}

/** Where and how one enqueue lands; a job runs as soon as possible by default. */
export type EnqueueOptions = {
  /** When the job may run first. */
  runAt?: Date
  /** How long from now before the job may run first: milliseconds or text such as `5 minutes`. */
  delay?: number | string
  /**
   * Keeps one waiting job per key; a running job does not count. With `mode: 'dedupe'` (the default) an enqueue while
   * one waits leaves it as it is, with `'replace'` it takes this payload and these options. Not for ordered jobs.
   */
  key?: string
  mode?: 'dedupe' | 'replace'
  /** The group of an ordered job; required there, refused elsewhere. */
  group?: string
  /** Higher runs first. Default 0. */
  priority?: number
}

// `any` by default, so a list of definitions takes jobs of every payload type.
export type JobDefinition<Payload = any> = {
  readonly kind: 'job'
  readonly name: string
  readonly options: JobOptions<Payload>
  /**
   * Adds a job and returns its id: in `db`'s own transaction when it is one, so the job commits with the caller's
   * writes or not at all. With a `key` it returns the waiting job's id when that one is kept.
   */
  enqueue(db: Db, ...args: Payload extends undefined ? [payload?: Payload, options?: EnqueueOptions] : [payload: Payload, options?: EnqueueOptions]): Promise<string>
}
