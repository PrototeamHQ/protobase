import { Hono } from 'hono'
import { createErrorHandler } from '../error-handler'
import type { Admin, AdminEnv } from '../types'
import { latestAdmin } from './latest-admin'
import type { UserTables } from './user-table-resources'

export type ReloadingAdminInput = {
  /** The admin startup built, from the user tables of `version`. */
  first: Admin
  version: string
  /** The definitions version now (`readDefinitionsVersion`). */
  readVersion: () => Promise<string>
  /** The user tables now (`userTableResources`). */
  readTables: () => Promise<UserTables>
  /** The admin of the app with these user tables, as startup built `first`. */
  build: (tables: UserTables) => Admin
  /** The app's `onUnhandledError`: a failed version read, and an admin that does not build. */
  report?: (error: unknown, request?: Request) => void
  statementTimeoutMs?: number
  now?: () => number
}

// The API's answer to a resource or field it does not know is a problem, not found or invalid.
const problemStatuses = new Set([400, 404])
const namesUnknown = (response: Response) => problemStatuses.has(response.status) && (response.headers.get('content-type')?.startsWith('application/problem+json') ?? false)

// A request that a second admin can answer again: one without a body as it is, one with JSON read once; another body
// is a stream, answered once.
const replayable = async (request: Request) => {
  if (!request.body) return () => request
  if (!request.headers.get('content-type')?.includes('json')) return
  const body = await request.arrayBuffer()
  return () => new Request(request, { body })
}

/**
 * The app's admin, rebuilt when the tables users add change, so every process serves a new definition without a
 * restart. `/meta` reads the definitions version first; any other request at most once a second, and once more when the
 * admin answers it not found or invalid, as it does a resource or field it does not know, and then is answered again by
 * the admin built anew. A request finishes on the admin it started with, and a WebSocket keeps the admin it opened
 * with. An admin that does not build with the new definitions is reported, and the one before keeps serving.
 * `reload()` reads the version at once, for the process that changed a definition. The jobs, the realtime prune and
 * the field decrypter are those of `first`.
 */
export const reloadingAdmin = ({ first, version, readVersion, readTables, build, report, statementTimeoutMs, now }: ReloadingAdminInput) => {
  const rebuild = async (current: Admin) => {
    const tables = await readTables()
    // Any error of the build: the checks of createAdmin throw plain errors, each naming what it refused.
    try {
      return build(tables)
    } catch (error) {
      report?.(new Error('The tables users add changed, but the app does not build with them, so it serves the tables it served before', { cause: error }))
      return current
    }
  }
  const latest = latestAdmin({ admin: first, version, readVersion, rebuild, ...(now && { now }) })

  const answer = async (request: Request, env: Parameters<Admin['fetch']>[1]) => {
    const path = new URL(request.url).pathname
    const atOnce = path === first.metaPath || path.startsWith(`${first.metaPath}/`)
    const admin = await latest.get(atOnce)
    const again = atOnce ? undefined : await replayable(request)
    if (!again) return admin.fetch(request, env)
    const answered = await admin.fetch(again(), env)
    if (!namesUnknown(answered)) return answered
    const fresh = await latest.get(true)
    return fresh === admin ? answered : fresh.fetch(again(), env)
  }

  const app = new Hono<AdminEnv>()
  app.onError(createErrorHandler(report, statementTimeoutMs))
  app.all('*', (c) => answer(c.req.raw, c.env))
  const reload = async () => void (await latest.get(true))
  return Object.assign(app, { jobs: first.jobs, startRealtimePrune: first.startRealtimePrune, decryptField: first.decryptField, metaPath: first.metaPath, reload })
}
