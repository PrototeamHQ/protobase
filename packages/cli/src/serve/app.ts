import { Hono } from 'hono'
import { logger } from 'hono/logger'
import { jobsDrainApp, type Admin, type JobsRuntime } from '@protobase/server'
import { isApiPath } from '../bundle/manifest'
import { serveStaticSite, type StaticSite } from './static-site'

// A bundle's UI, served for every path outside its `api` prefixes.
export type ServedSite = StaticSite & { api: string[] }

export type ServeAppInput = {
  /** The project's admin API (`projectAdmin`). */
  admin: Admin
  requestLog: boolean
  site?: ServedSite
  // The jobs this process started, and the operator's token that may drain them.
  jobs?: JobsRuntime
  drainToken?: string
}

// The admin API from createAdmin, plus GET /health for the platform's probes, POST /api/jobs/drain for the operator
// with a drain token, and with a site its UI around them.
export const createServeApp = ({ admin, requestLog, site, jobs, drainToken }: ServeAppInput) => {
  const app = new Hono()
  if (requestLog) app.use(logger())
  // Liveness only: it needs no token and does not touch the database.
  app.get('/health', (c) => c.json({ status: 'ok' }))
  if (site) app.use('*', (c, next) => (isApiPath(site.api, c.req.path) ? next() : serveStaticSite(site, c.req.raw)))
  if (jobs && drainToken) app.route('/', jobsDrainApp({ runtime: jobs, token: drainToken }))
  app.route('/', admin)
  return app
}
