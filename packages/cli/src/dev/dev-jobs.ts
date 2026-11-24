import { checkJobsSchema, startJobs, type FieldDecrypter, type JobDefinition, type JobsRuntime, type Mailer, type UnsubscribeLinks } from '@protobase/server'
import type { Db, ScopedTables } from '@protobase/query'

// On globalThis: the dev server's entry module is evaluated again on every edit, the runtime is started once, with
// the scope it was started with.
const store = globalThis as { __protobaseJobs?: JobsRuntime; __protobaseJobsScope?: string }

/**
 * Runs the project's jobs in the dev server: started on the first load, once the jobs schema checks out, with the app's
 * tables it keeps to one organization (`organizationScope`), its own mailer when it has one and the links of its unsubscribe, and given the reloaded definitions and the rebuilt app's `decryptField` on every load
 * after it, so an edited job runs its new code from the next job on. An edit that changes the scope, such as turning
 * organizations on, stops the jobs and starts them again with it. A mailer added or changed later is the jobs' from the next start.
 */
export const devJobs = async (db: Db, scope: ScopedTables, definitions: JobDefinition[], decryptField: FieldDecrypter, mailer?: Mailer, unsubscribe?: UnsubscribeLinks) => {
  const scopeKey = JSON.stringify(scope)
  if (store.__protobaseJobs && store.__protobaseJobsScope !== scopeKey) await stopDevJobs()
  if (store.__protobaseJobs) return store.__protobaseJobs.update(definitions, decryptField)
  if (definitions.length === 0) return
  await checkJobsSchema(db)
  store.__protobaseJobs = await startJobs({ db, scope, jobs: definitions, decryptField, ...(mailer && { mailer }), ...(unsubscribe && { unsubscribe }), onError: (error) => console.error(error) })
  store.__protobaseJobsScope = scopeKey
}

/** Lets running jobs finish and stops them, when the dev server closes. */
export const stopDevJobs = async () => {
  const runtime = store.__protobaseJobs
  delete store.__protobaseJobs
  delete store.__protobaseJobsScope
  await runtime?.stop()
}
