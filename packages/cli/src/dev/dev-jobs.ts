import { checkJobsSchema, startJobs, type JobDefinition, type JobsRuntime } from '@protobase/server'
import type { Db } from '@protobase/query'

// On globalThis: the dev server's entry module is evaluated again on every edit, the runtime is started once.
const store = globalThis as { __protobaseJobs?: JobsRuntime }

/**
 * Runs the project's jobs in the dev server: started on the first load, once the jobs schema checks out, and given the
 * reloaded definitions on every load after it, so an edited job runs its new code from the next job on.
 */
export const devJobs = async (db: Db, definitions: JobDefinition[]) => {
  if (store.__protobaseJobs) return store.__protobaseJobs.update(definitions)
  if (definitions.length === 0) return
  await checkJobsSchema(db)
  store.__protobaseJobs = await startJobs({ db, jobs: definitions, onError: (error) => console.error(error) })
}

/** Lets running jobs finish and stops them, when the dev server closes. */
export const stopDevJobs = async () => {
  const runtime = store.__protobaseJobs
  delete store.__protobaseJobs
  await runtime?.stop()
}
