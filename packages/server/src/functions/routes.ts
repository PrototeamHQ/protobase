import { Hono, type ErrorHandler } from 'hono'
import { cors } from 'hono/cors'
import type { Db } from '@protobase/query'
import { forbidden, notFound } from '../problem'
import type { Authenticator, Session } from '../types'
import { invokeFunction, type ApiFunction, type FunctionCaller, type FunctionContext, type PublicFunctionContext } from './define-function'
import type { FunctionRecords } from './records'

export type FunctionRoutesInput = {
  /** Where the functions live, such as `/api/functions`; each is at `<basePath>/<name>`. */
  basePath: string
  functions: Record<string, ApiFunction>
  authenticate: Authenticator
  db: Db
  records: (session: Session) => FunctionRecords
  onError: ErrorHandler
}

// The request as the function sees it: the same request, its path relative to the function.
const relativeRequest = (request: Request, prefix: string) => {
  const url = new URL(request.url)
  url.pathname = url.pathname.slice(prefix.length) || '/'
  return new Request(url, request)
}

const requireRoles = (name: string, session: Session, roles?: string[]) => {
  if (!roles || roles.some((role) => session.user.roles.includes(role))) return
  throw forbidden('function-forbidden', `You may not call the function "${name}"`)
}

/**
 * Every function at `<basePath>/<name>` and below, any method. A protected function authenticates the request first, so
 * a call without a valid token is the authenticator's 401 problem; a public one gets the caller only when it asks.
 */
export const functionRoutes = ({ basePath, functions, authenticate, db, records, onError }: FunctionRoutesInput) => {
  const app = new Hono().basePath(basePath)
  app.onError(onError)
  const callerOf = async (request: Request): Promise<FunctionCaller> => {
    const session = await authenticate(request)
    return { session, records: records(session) }
  }

  for (const [name, fn] of Object.entries(functions)) {
    const prefix = `${basePath}/${name}`
    const { options } = fn
    if (options.cors) app.use(`/${name}/*`, cors(options.cors))
    app.all(`/${name}/*`, async (c) => {
      const request = relativeRequest(c.req.raw, prefix)
      if (options.public) {
        let caller: Promise<FunctionCaller> | undefined
        const context: PublicFunctionContext = { name, db, caller: () => (caller ??= callerOf(c.req.raw)) }
        return invokeFunction(name, fn, request, context)
      }
      const caller = await callerOf(c.req.raw)
      requireRoles(name, caller.session, options.roles)
      const context: FunctionContext = { name, db, ...caller, caller: async () => caller }
      return invokeFunction(name, fn, request, context)
    })
  }
  app.all('/*', (c) => {
    throw notFound(`There is no function at ${c.req.path}`)
  })
  return app
}
