import type { Db } from '@protobase/query'
import type { EnqueueOptions, JobDefinition } from './job-types'

/** What `defineJob(...).enqueue` reaches: the jobs runtime this process started. */
export type JobsEnqueuer = {
  enqueue(definition: JobDefinition, db: Db, payload: unknown, options?: EnqueueOptions): Promise<string>
  /** The job of this name among the jobs this runtime took, or `undefined`. */
  definition(name: string): JobDefinition | undefined
  /** Has this process's worker of the job look for due jobs now rather than at its next poll; nothing without one. */
  wake(name: string): void
}

// On globalThis rather than in this module, so a dev server that loads the project's modules again still finds the
// runtime it started once.
const key = Symbol.for('protobase.jobs')
const holder = globalThis as { [key]?: JobsEnqueuer }

/** The running jobs runtime; enqueueing needs one, started by `protobase dev`, `serve` and `worker`, or by `startJobs`. */
export const currentJobs = () => {
  const runtime = holder[key]
  if (!runtime) throw new Error('Jobs are not running in this process: start them with startJobs(), as protobase dev, serve and worker do')
  return runtime
}

/** The running jobs runtime, if this process started one. */
export const runningJobs = (): JobsEnqueuer | undefined => holder[key]

export const setCurrentJobs = (runtime: JobsEnqueuer) => {
  if (holder[key]) throw new Error('Jobs are already running in this process; stop them before starting them again')
  holder[key] = runtime
}

export const clearCurrentJobs = (runtime: JobsEnqueuer) => {
  if (holder[key] === runtime) delete holder[key]
}
