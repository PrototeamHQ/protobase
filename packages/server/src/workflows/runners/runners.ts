import { Hono } from 'hono'
import type { Db } from '@protobase/query'
import type { Deps } from '../../deps'
import type { AdminEnv } from '../../types'
import type { RunnerSettings } from '../options'
import type { SecretKey } from '../../better-auth/connections/sealed-revocation'
import { jobSealer } from './job-seal'
import { issueRegistration } from './registration'
import { runnerBroker } from './runner-broker'
import { runnerSaveHook } from './runner-hook'
import { customStepQueue, leaseJob, runnerJobs, type AnswerByHash } from './runner-jobs'
import { runnerRoute } from './runner-route'

/**
 * What custom steps' runners need of the engine: where the runner queues a custom step's try (`queue`), the runners'
 * calls (`route`, under `.../runners/v1`) and the registration tokens a caller who may change a runner issues
 * (`registration`, `POST .../workflows/runners/<id>/registration`), the lease job and the hook that checks a runner's
 * writes. Each job's Task is answered by its token's hash through `answer`, the waiting Tasks' own path, and its
 * arguments are sealed with the app's secret (`key`) while it waits.
 */
export const customStepRunners = ({ deps, schema, settings, secrets, key, answer }: { deps: () => Deps; schema: string; settings: RunnerSettings; secrets: readonly string[]; key: () => Promise<SecretKey>; answer: AnswerByHash }) => {
  const db = (): Db => deps().db
  const report = (error: unknown) => deps().report(error)
  const lease = leaseJob({ schema, settings, answer, requeued: () => broker.nudge() })
  const sealer = jobSealer(key)
  const broker = runnerBroker({ db, schema, settings, lease: () => lease, sealer, answer, report })
  const jobs = runnerJobs({ db, schema, settings, secrets, answer })
  const registration = () => {
    const app = new Hono<AdminEnv>()
    app.post('/:id/registration', async (c) => c.json(await issueRegistration(deps, schema, c.get('session'), c.req.param('id')), 200, { 'Cache-Control': 'no-store' }))
    return app
  }
  return {
    queue: customStepQueue(schema, sealer, () => broker.nudge()),
    route: () => runnerRoute({ db, schema, broker, jobs, report }),
    registration,
    jobs: [lease],
    hooks: [runnerSaveHook],
  }
}
