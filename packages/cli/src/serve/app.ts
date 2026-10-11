import { Hono } from 'hono'
import { logger } from 'hono/logger'
import type { Db } from '@protobase/query'
import { configExports, createAdmin, jobDefinitions, jobsDrainApp, type JobsRuntime } from '@protobase/server'
import { isApiPath } from '../bundle/manifest'
import type { ServedProject } from './load-bundle'
import { serveStaticSite, type StaticSite } from './static-site'

// A bundle's UI, served for every path outside its `api` prefixes.
export type ServedSite = StaticSite & { api: string[] }

export type ServeAppInput = {
  project: ServedProject
  db: Db
  requestLog: boolean
  site?: ServedSite
  // The jobs this process started, and the operator's token that may drain them.
  jobs?: JobsRuntime
  drainToken?: string
}

// The admin API from createAdmin, plus GET /health for the platform's probes, POST /api/jobs/drain for the operator
// with a drain token, and with a site its UI around them.
export const createServeApp = ({ project, db, requestLog, site, jobs, drainToken }: ServeAppInput) => {
  const { resources, views, pages, userMenu } = configExports(project.config)
  const admin = createAdmin({
    resources,
    views,
    pages,
    ...(userMenu && { userMenu }),
    db,
    authenticate: project.authenticate,
    ...(project.auth && { auth: project.auth }),
    ...(project.functions && { functions: project.functions }),
    ...(project.files && { files: project.files }),
    ...(project.events && { events: project.events }),
    jobs: jobDefinitions(project.jobs ?? {}),
    options: { onUnhandledError: (error) => console.error(error), ...project.options },
  })
  const app = new Hono()
  if (requestLog) app.use(logger())
  // Liveness only: it needs no token and does not touch the database.
  app.get('/health', (c) => c.json({ status: 'ok' }))
  if (site) app.use('*', (c, next) => (isApiPath(site.api, c.req.path) ? next() : serveStaticSite(site, c.req.raw)))
  if (jobs && drainToken) app.route('/', jobsDrainApp({ runtime: jobs, token: drainToken }))
  app.route('/', admin)
  return app
}
