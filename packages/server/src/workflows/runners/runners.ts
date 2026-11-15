import { Hono } from 'hono'
import type { Db } from '@protobase/query'
import type { Deps } from '../../deps'
import type { AdminEnv } from '../../types'
import type { RunnerSettings } from '../options'
import type { SecretKey } from '../../better-auth/connections/sealed-revocation'
import type { StorageInput } from '../storage/plugin-storage'
import { jobSealer } from './job-seal'
import { issueRegistration } from './registration'
import { runnerBroker } from './runner-broker'
import { runnerFiles } from './runner-files'
import { runnerSaveHook } from './runner-hook'
import { installRoute } from './runner-install'
import { customStepQueue, leaseJob, runnerJobs, type AnswerByHash } from './runner-jobs'
import { runnerRoute } from './runner-route'

/**
 * What custom steps' runners need of the engine: where the runner queues a custom step's try (`queue`), the runners'
 * calls (`route`, under `.../runners/v1`), the install script (`install`, `.../runners/install.sh`) and the
 * registration tokens a caller who may change a runner issues (`registration`,
 * `POST .../workflows/runners/<id>/registration`), the lease job and the hook that checks a runner's writes. Each job's
 * Task is answered by its token's hash through `answer`, the waiting Tasks' own path, and its arguments are sealed with
 * the app's secret (`key`) while it waits. Its files are read and stored through `storage`, as the run's storage steps
 * do, and the app's address, for the install script and its command, is `origin`, else the request's.
 */
export const customStepRunners = ({ deps, schema, settings, secrets, key, answer, storage, origin }: { deps: () => Deps; schema: string; settings: RunnerSettings; secrets: readonly string[]; key: () => Promise<SecretKey>; answer: AnswerByHash; storage: StorageInput; origin: () => string | undefined }) => {
  const db = (): Db => deps().db
  const report = (error: unknown) => deps().report(error)
  const lease = leaseJob({ schema, settings, answer, requeued: () => broker.nudge() })
  const sealer = jobSealer(key)
  const broker = runnerBroker({ db, schema, path: () => `${deps().systemPath}/runners/v1`, settings, lease: () => lease, sealer, answer, report })
  const jobs = runnerJobs({ db, schema, settings, secrets, answer })
  const files = runnerFiles({ db, schema, sealer, storage, files: () => deps().files })
  const registration = () => {
    const app = new Hono<AdminEnv>()
    app.post('/:id/registration', async (c) => c.json(await issueRegistration(deps, schema, c.get('session'), c.req.param('id'), origin() ?? new URL(c.req.url).origin), 200, { 'Cache-Control': 'no-store' }))
    return app
  }
  return {
    queue: customStepQueue(schema, sealer, () => broker.nudge()),
    route: () => runnerRoute({ db, schema, broker, jobs, files, report }),
    install: () => installRoute(origin),
    registration,
    jobs: [lease],
    hooks: [runnerSaveHook],
  }
}
