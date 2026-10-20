import { Hono } from 'hono'
import type { Caller } from '../api-keys/resolve-caller'
import { HttpProblem } from '../problem'
import { errorResponse } from './respond'
import type { RestDeps, RestEnv } from './rest-context'
import { restError, restErrorOf } from './rest-error'
import { rpcRoute } from './rpc-route'
import { tableRoutes } from './table-routes'

export type RestRoutesInput = {
  deps: RestDeps
  /** Who a request runs as, from its `apikey` and bearer (see `apiKeyCaller`). */
  caller: (request: Request) => Promise<Caller>
  /** Called with every error that becomes a 500, and its request. */
  report?: (error: unknown, request?: Request) => void
}

/**
 * The PostgREST-compatible API supabase-js's `from()` and `rpc()` call, mounted at `/rest/v1`. Each request runs in one
 * transaction as `anon`, `authenticated` or the app's own role, so the tables' RLS policies decide what it may read and
 * write. Errors come back as PostgREST's `{ code, details, hint, message }`; an unexpected one as a 500 that names
 * nothing of it.
 */
export const restRoutes = ({ deps, caller, report }: RestRoutesInput) => {
  const app = new Hono<RestEnv>()
  app.onError((error, c) => {
    const known = restErrorOf(error, c.get('caller')?.role === 'anon')
    if (known) return errorResponse(known)
    // The caller's 401, from a missing or wrong key or token.
    if (error instanceof HttpProblem) return errorResponse(restError(error.status, error.status === 401 ? 'PGRST301' : 'PGRST000', error.detail).withHeaders(error.headers))
    report?.(error, c.req.raw)
    return errorResponse(restError(500, 'PGRST000', 'The server failed to handle the request'))
  })
  app.use('*', async (c, next) => {
    c.set('caller', await caller(c.req.raw))
    await next()
  })
  // Before the tables, so a table may not take the name `rpc`, as on PostgREST.
  app.route('/', rpcRoute(deps))
  app.route('/', tableRoutes(deps))
  app.notFound(() => errorResponse(restError(404, 'PGRST125', 'Invalid path specified in request URL')))
  return app
}
