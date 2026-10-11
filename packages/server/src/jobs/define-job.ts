import { currentJobs } from './current'
import type { EnqueueOptions, JobDefinition, JobOptions } from './job-types'
import { nextRun } from './schedule'

const namePattern = /^[\w.\-/]+$/

const checkSchedule = (name: string, schedule: string, timezone: string) => {
  try {
    nextRun(schedule, timezone, new Date())
  } catch (error) {
    if (!(error instanceof Error)) throw error
    throw new Error(`Job "${name}" has the schedule "${schedule}" in ${timezone}, which is not a cron schedule there: ${error.message}`, { cause: error })
  }
}

/** A job the app's workers run: export it from the module that `protobase.config.ts` passes as `jobs`. */
export const defineJob = <Payload = undefined>(options: JobOptions<Payload>): JobDefinition<Payload> => {
  if (!namePattern.test(options.name)) throw new Error(`Job name "${options.name}" may only hold letters, digits, "_", "-", "." and "/"`)
  if (options.schedule !== undefined) checkSchedule(options.name, options.schedule, options.timezone ?? 'UTC')
  const definition: JobDefinition<Payload> = {
    kind: 'job',
    name: options.name,
    options,
    enqueue: async (db, payload?: Payload, enqueueOptions?: EnqueueOptions) => currentJobs().enqueue(definition as JobDefinition, db, payload, enqueueOptions),
  }
  return definition
}

export const isJobDefinition = (value: unknown): value is JobDefinition =>
  typeof value === 'object' && value !== null && (value as { kind?: unknown }).kind === 'job' && typeof (value as { enqueue?: unknown }).enqueue === 'function'

/** The job definitions among a module's exports, such as `import * as jobs from './config/jobs'`, each name once. */
export const jobDefinitions = (module: Record<string, unknown>) => {
  const byName = new Map<string, JobDefinition>()
  for (const value of Object.values(module)) {
    if (!isJobDefinition(value)) continue
    const known = byName.get(value.name)
    if (known && known !== value) throw new Error(`Two jobs are named "${value.name}"; rename one of them`)
    byName.set(value.name, value)
  }
  return [...byName.values()]
}
