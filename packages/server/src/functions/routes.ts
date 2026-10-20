import { Hono, type ErrorHandler } from 'hono'
import { cors } from 'hono/cors'
import type { Db } from '@protobase/query'
import type { ResolveOptions } from '@protobase/schema'
import { runInBackground } from '../background-work'
import { notFound } from '../problem'
import type { Authenticator, Session } from '../types'
import { invokeFunction, type ApiFunction, type FunctionCaller, type FunctionContext, type PublicFunctionContext } from './define-function'
import { functionGate, requireGate } from './function-gate'
import type { FunctionRecords } from './records'

export type FunctionRoutesInput = {
  /** Where the functions live, such as `/api/functions`; each is at `<basePath>/<name>`. */
  basePath: string
  functions: Record<string, ApiFunction>
  authenticate: Authenticator
  /** The app's roles and default access, which decide who may call a protected function (see `functionGate`). */
  access: ResolveOptions
  db: Db
  records: (session: Session) => FunctionRecords
  onError: ErrorHandler
  /** After a call ended, its writes through `db` committed: has the change dispatcher deliver them now, as after an API write. */
  wake: () => void
}

// The request as the function sees it: the same request, its path relative to the function.
export const relativeRequest = (request: Request, prefix: string) => {
  const url = new URL(request.url)
  url.pathname = url.pathname.slice(prefix.length) || '/'
  return new Request(url, request)
}

/**
 * Every function at `<basePath>/<name>` and below, any method. A protected function authenticates the request first, so
 * a call without a valid token is the authenticator's 401 problem, and one its gate refuses a 403; a public one gets the caller only when it asks. Each
 * call runs as background work, so calls that hold the database for long leave a connection to page requests. Once a
 * call ends, failed or not, `wake` runs, so what it wrote reaches open pages without waiting for the dispatcher's poll.
 */
export const functionRoutes = ({ basePath, functions, authenticate, access, db, records, onError, wake }: FunctionRoutesInput) => {
  const app = new Hono().basePath(basePath)
  app.onError(onError)
  const callerOf = async (request: Request): Promise<FunctionCaller> => {
    const session = await authenticate(request)
    return { session, records: records(session) }
  }
  const call = (work: () => Promise<Response>) => work().finally(wake)

  for (const [name, fn] of Object.entries(functions)) {
    const prefix = `${basePath}/${name}`
    const { options } = fn
    const gate = functionGate(name, options, access)
    if (options.cors) app.use(`/${name}/*`, cors(options.cors))
    app.all(`/${name}/*`, (c) => runInBackground(() => call(async () => {
      const request = relativeRequest(c.req.raw, prefix)
      if (options.public) {
        let caller: Promise<FunctionCaller> | undefined
        const context: PublicFunctionContext = { name, db, caller: () => (caller ??= callerOf(c.req.raw)) }
        return invokeFunction(name, fn, request, context)
      }
      const caller = await callerOf(c.req.raw)
      requireGate(name, gate, caller.session)
      const context: FunctionContext = { name, db, ...caller, caller: async () => caller }
      return invokeFunction(name, fn, request, context)
    })))
  }
  app.all('/*', (c) => {
    throw notFound(`There is no function at ${c.req.path}`)
  })
  return app
}
