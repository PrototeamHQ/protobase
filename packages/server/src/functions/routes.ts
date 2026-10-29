import { Hono, type ErrorHandler } from 'hono'
import { cors } from 'hono/cors'
import type { UpgradeWebSocket } from 'hono/ws'
import type { Db } from '@protobase/query'
import type { ResolveOptions } from '@protobase/schema'
import { auditOrigin } from '../audit/origin'
import { runInBackground } from '../background-work'
import { callsAccess } from '../calls/calls-access'
import type { CallsOptions } from '../calls/calls-options'
import type { FieldDecrypter } from '../encryption/decrypt-field-types'
import { forbidden, notFound } from '../problem'
import { namingTimeouts } from '../statement-timeout'
import type { Authenticator, Session } from '../types'
import { socketAcceptor } from './accept-socket'
import { invokeFunction, type ApiFunction, type FunctionCaller, type FunctionContext, type PublicFunctionContext } from './define-function'
import { functionGate, requireGate, type FunctionGate } from './function-gate'
import type { FunctionRecords } from './records'
import { sameCaller } from './same-caller'

export type FunctionRoutesInput = {
  /** Where the functions live, such as `/api/functions`; each is at `<basePath>/<name>`. */
  basePath: string
  functions: Record<string, ApiFunction>
  authenticate: Authenticator
  /** The app's roles and default access, which decide who may call a protected function (see `functionGate`). */
  access: ResolveOptions
  db: Db
  records: (session: Session) => FunctionRecords
  /** The app's read of encrypted fields, which a protected function's context binds to the function and its caller. */
  decryptField: FieldDecrypter
  onError: ErrorHandler
  /** After a call ended, its writes through `db` committed: has the change dispatcher deliver them now, as after an API write. */
  wake: () => void
  /**
   * The host's WebSocket upgrade, `@hono/node-server`'s `upgradeWebSocket`, the only one supported: function sockets use
   * its `ws` socket's send callback and `bufferedAmount`. Without it, `acceptWebSocket` is a 500.
   */
  upgradeWebSocket?: UpgradeWebSocket
  /** The caller of an upgrade request, which may come with a cookie instead of a token; defaults to `authenticate`. */
  upgradeAuthenticate?: Authenticator
  /** The app's calls, which functions admit members to; without them, `calls.join` rejects. */
  calls?: CallsOptions
  report: (error: unknown) => void
}

// The request as the function sees it: the same request, its path relative to the function.
export const relativeRequest = (request: Request, prefix: string) => {
  const url = new URL(request.url)
  url.pathname = url.pathname.slice(prefix.length) || '/'
  return new Request(url, request)
}

const isUpgrade = (request: Request) => request.headers.get('upgrade')?.toLowerCase() === 'websocket'

/**
 * Every function at `<basePath>/<name>` and below, any method. A protected function authenticates the request first, so
 * a call without a valid token is the authenticator's 401 problem, and one its gate refuses a 403; a public one gets the caller only when it asks. Each
 * call runs as background work, so calls that hold the database for long leave a connection to page requests. Once a
 * call ends, failed or not, `wake` runs, so what it wrote reaches open pages without waiting for the dispatcher's poll.
 * A function may answer an upgrade with a socket, only once it returned. While it is open, its caller is checked again
 * every minute: a protected function's always, a public one's once `caller()` resolved.
 */
export const functionRoutes = ({ basePath, functions, authenticate, access, db, records, decryptField, onError, wake, upgradeWebSocket, upgradeAuthenticate = authenticate, calls: callsOptions, report }: FunctionRoutesInput) => {
  const calls = callsAccess(callsOptions)
  const app = new Hono().basePath(basePath)
  app.onError(onError)
  const sessionOf = (request: Request) => (isUpgrade(request) ? upgradeAuthenticate(request) : authenticate(request))
  const callerOf = async (request: Request): Promise<FunctionCaller> => {
    const session = await sessionOf(request)
    return { session, records: records(session) }
  }
  // As background work, with the long queries a function asked for; a query the database stopped names the call.
  const call = (fn: ApiFunction, subject: string, work: () => Promise<Response>) => {
    const { longQueries } = fn.options
    return runInBackground(() => namingTimeouts(subject, { kind: longQueries ? 'long' : 'database' }, work).finally(wake), { longQueries })
  }
  // The caller as they would be now: refused, or changed, closes the socket so it reconnects as who they are.
  const recheckCaller = async (name: string, gate: FunctionGate, request: Request, first: Session) => {
    const again = await upgradeAuthenticate(request)
    requireGate(name, gate, again)
    if (!sameCaller(first, again)) throw forbidden('caller-changed', 'Your access changed: open the socket again')
  }

  for (const [name, fn] of Object.entries(functions)) {
    const prefix = `${basePath}/${name}`
    const { options } = fn
    const gate = functionGate(name, options, access)
    if (options.cors) app.use(`/${name}/*`, cors(options.cors))
    app.all(`/${name}/*`, (c) => call(fn, `${c.req.method} ${c.req.path}`, async () => {
      const request = relativeRequest(c.req.raw, prefix)
      if (options.public) {
        let caller: Promise<FunctionCaller> | undefined
        let admitted: Session | undefined
        const resolveCaller = () => (caller ??= callerOf(c.req.raw).then((resolved) => ((admitted = resolved.session), resolved)))
        // Only a caller the function asked for ties the socket to them, from the next minute's check on.
        const recheck = async () => {
          if (admitted) await recheckCaller(name, gate, c.req.raw, admitted)
        }
        const acceptor = socketAcceptor({ c, upgradeWebSocket, report, recheck })
        const context: PublicFunctionContext = { name, db, caller: resolveCaller, acceptWebSocket: acceptor.accept, calls }
        return acceptor.answer(name, await invokeFunction(name, fn, request, context))
      }
      const caller = await callerOf(c.req.raw)
      requireGate(name, gate, caller.session)
      const recheck = () => recheckCaller(name, gate, c.req.raw, caller.session)
      const acceptor = socketAcceptor({ c, upgradeWebSocket, report, recheck })
      const { user } = caller.session
      const reader = { function: name, actor: { id: user.id, roles: [...user.roles] }, origin: auditOrigin(c.req.raw.headers) }
      const context: FunctionContext = { name, db, ...caller, caller: async () => caller, decryptField: decryptField(reader), acceptWebSocket: acceptor.accept, calls }
      return acceptor.answer(name, await invokeFunction(name, fn, request, context))
    }))
  }
  app.all('/*', (c) => {
    throw notFound(`There is no function at ${c.req.path}`)
  })
  return app
}
