import type { JobResult, JobWithMetadata } from 'pg-boss'
import type { Db } from '@protobase/query'
import type { Mailer } from '../mail/smtp-mailer'
import type { JobDefinition } from './job-types'

/** Thrown from a job's `run`, it fails the job now: the attempts it has left are not used. */
export class FatalJobError extends Error {
  override name = 'FatalJobError'
}

/** The payload as the job's `payload` schema returns it, or why it does not pass. */
export const validatePayload = async (definition: JobDefinition, payload: unknown): Promise<{ value: unknown } | { invalid: string }> => {
  const schema = definition.options.payload
  if (!schema) return { value: payload }
  const result = await schema['~standard'].validate(payload)
  if (!result.issues) return { value: result.value }
  const issues = result.issues.map((issue) => {
    const field = (issue.path ?? []).map((part) => String(typeof part === 'object' ? part.key : part)).join('.')
    return field ? `${field}: ${issue.message}` : issue.message
  })
  return { invalid: `Job "${definition.name}" has an invalid payload: ${issues.join('; ')}` }
}

// A payload that does not pass the schema when the job runs fails it for good: a retry would not change it.
const checkPayload = async (definition: JobDefinition, payload: unknown) => {
  const checked = await validatePayload(definition, payload)
  if ('invalid' in checked) throw new FatalJobError(checked.invalid)
  return checked.value
}

// SQLSTATE 25006: the database is read-only, as during a deploy's write freeze. That is a reason to wait, not a failure.
const readOnly = (error: unknown) => (error as { code?: unknown })?.code === '25006'

const pause = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    if (signal.aborted) return resolve()
    const timer = setTimeout(resolve, ms)
    signal.addEventListener('abort', () => {
      clearTimeout(timer)
      resolve()
    }, { once: true })
  })

/** Runs `run` again every `waitMs` while the database is read-only, until the signal ends the try. */
export const throughWriteFreeze = async (run: () => Promise<void> | void, signal: AbortSignal, waitMs = 5_000) => {
  for (;;) {
    try {
      return await run()
    } catch (error) {
      if (!readOnly(error) || signal.aborted) throw error
      await pause(waitMs, signal)
    }
  }
}

/** What a failed try keeps as the job's output, which the admin app shows as its last error. */
const errorOutput = (error: unknown) =>
  error instanceof Error ? { name: error.name, message: error.message, ...(error.stack && { stack: error.stack }) } : { message: String(error) }

/**
 * One try of one job: completed when `run` returns, failed (to be retried while attempts are left) when it throws, and
 * failed for good on a `FatalJobError` or an invalid payload.
 */
export const runJob = async (definition: JobDefinition, job: JobWithMetadata<unknown>, db: Db, mail?: Mailer): Promise<JobResult> => {
  try {
    const payload = await checkPayload(definition, job.data ?? undefined)
    const context = {
      db,
      job: { id: job.id, name: job.name, attempt: job.retryCount + 1, maxAttempts: job.retryLimit + 1 },
      signal: job.signal,
      ...(mail && { mail }),
    }
    await throughWriteFreeze(() => definition.options.run(payload, context), job.signal)
    return { id: job.id, status: 'completed' }
  } catch (error) {
    return { id: job.id, status: error instanceof FatalJobError ? 'deadletter' : 'failed', output: errorOutput(error) }
  }
}
