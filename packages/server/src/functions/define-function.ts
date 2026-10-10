import type { Db } from '@protobase/query'
import type { Session } from '../types'
import type { FunctionRecords } from './records'

/** What every function gets: its name and the raw database. */
export type PublicFunctionContext = {
  /** The function's name, as in `/api/functions/<name>`. */
  name: string
  /** The database itself, with no access rules, row filters or tenant scope: privileged work only. */
  db: Db
  /** The caller, through the app's own `authenticate`: rejects with a 401 problem when the request carries no valid token. */
  caller: () => Promise<FunctionCaller>
}

/** Who called a function, and the app's resources as them. */
export type FunctionCaller = {
  session: Session
  /** The app's resources as this caller, under the same access rules, row filters and tenant scope as the REST API. */
  records: FunctionRecords
}

/** What a function that needs a signed-in caller gets: the caller resolved before it runs. */
export type FunctionContext = PublicFunctionContext & FunctionCaller

/** A Web-standard handler. Its request's path is the part after `/api/functions/<name>`: `/` or `/more/parts`. */
export type FunctionHandler = (request: Request, context: FunctionContext) => Response | Promise<Response>

export type PublicFunctionHandler = (request: Request, context: PublicFunctionContext) => Response | Promise<Response>

/** Any app with a Hono-style `fetch`, such as `new Hono()`: its `c.env` is the function's context. */
export type FunctionApp<Context = FunctionContext> = { fetch: (request: Request, env: Context) => Response | Promise<Response> }

/** `hono/cors` options: an origin, a list of them, or a function of the request's origin. */
export type CorsOptions = {
  origin: string | string[] | ((origin: string) => string | undefined | null)
  allowMethods?: string[]
  allowHeaders?: string[]
  exposeHeaders?: string[]
  maxAge?: number
  credentials?: boolean
}

type SharedOptions = {
  /** Answers CORS preflights before authentication and adds the CORS headers to every response, problems included. */
  cors?: CorsOptions
}

/** A function anyone may call, such as a webhook; it can still ask for a caller with `context.caller()`. */
export type PublicFunctionOptions = SharedOptions & { public: true }

export type ProtectedFunctionOptions = SharedOptions & {
  public?: false
  /** The caller needs one of these roles, otherwise the call is a 403 problem. */
  roles?: string[]
}

export type FunctionOptions = PublicFunctionOptions | ProtectedFunctionOptions

/** A function as `createAdmin` serves it: its options and what answers its requests. */
export type ApiFunction =
  | { kind: 'function'; options: PublicFunctionOptions; handler: PublicFunctionHandler | FunctionApp<PublicFunctionContext> }
  | { kind: 'function'; options: ProtectedFunctionOptions; handler: FunctionHandler | FunctionApp }

/** What a function file may default-export: `defineFunction(...)`, a bare handler or a Hono app (both protected). */
export type FunctionSource = ApiFunction | FunctionHandler | FunctionApp

/**
 * A function of your own, served at `/api/functions/<name>`. Without options it needs a signed-in caller, through the
 * app's `authenticate`; `{ public: true }` opens it to anyone, as for a webhook.
 */
export function defineFunction(handler: FunctionHandler | FunctionApp): ApiFunction
export function defineFunction(options: PublicFunctionOptions, handler: PublicFunctionHandler | FunctionApp<PublicFunctionContext>): ApiFunction
export function defineFunction(options: ProtectedFunctionOptions, handler: FunctionHandler | FunctionApp): ApiFunction
export function defineFunction(first: FunctionOptions | FunctionHandler | FunctionApp, handler?: unknown): ApiFunction {
  if (handler === undefined) return { kind: 'function', options: {}, handler: first as FunctionHandler | FunctionApp }
  return { kind: 'function', options: first, handler } as ApiFunction
}

const isApp = (value: unknown): value is FunctionApp => typeof value === 'object' && value !== null && typeof (value as FunctionApp).fetch === 'function'

const isApiFunction = (value: unknown): value is ApiFunction => typeof value === 'object' && value !== null && (value as ApiFunction).kind === 'function'

/** A function's name is its URL segment: letters, digits, `-` and `_`, starting with a letter or digit. */
export const functionNamePattern = /^[A-Za-z0-9][A-Za-z0-9_-]*$/

/** The function a source stands for; anything else is an error naming it. */
export const toApiFunction = (name: string, source: unknown): ApiFunction => {
  if (!functionNamePattern.test(name)) throw new Error(`The function name "${name}" is not a URL segment: use letters, digits, - and _`)
  if (isApiFunction(source)) {
    if (typeof source.handler !== 'function' && !isApp(source.handler)) throw new Error(`The function "${name}" has no handler: pass a (request, context) function or a Hono app`)
    return source
  }
  if (typeof source === 'function' || isApp(source)) return defineFunction(source as FunctionHandler | FunctionApp)
  throw new Error(`The function "${name}" must default-export defineFunction(...), a (request, context) handler or a Hono app`)
}

/** Calls a function's handler or app with its request and context; anything but a Response is an error. */
export const invokeFunction = async (name: string, fn: ApiFunction, request: Request, context: PublicFunctionContext | FunctionContext) => {
  const { handler } = fn
  const response: unknown = isApp(handler) ? await handler.fetch(request, context as FunctionContext) : await (handler as FunctionHandler)(request, context as FunctionContext)
  if (!(response instanceof Response)) throw new Error(`The function "${name}" returned no Response`)
  return response
}
