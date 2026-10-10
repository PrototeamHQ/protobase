import { Hono, type Env } from 'hono'
import { notFound } from '../problem'
import type { FunctionContext, PublicFunctionContext } from './define-function'

/** A Hono app's env for a protected function: `c.env` is its context, `c.env.records` the caller's records. */
export type FunctionEnv = { Bindings: FunctionContext }

/** A Hono app's env for a public function. */
export type PublicFunctionEnv = { Bindings: PublicFunctionContext }

/**
 * `new Hono()` for a function, whose errors and unknown paths reach the app's own error handling: problems as
 * problem+json, anything else a 500 the app reports. A plain Hono app answers them itself.
 */
export const functionApp = <E extends Env = FunctionEnv>() => {
  const app = new Hono<E>()
  app.onError((error) => {
    throw error
  })
  app.notFound((c) => {
    throw notFound(`There is no route at ${c.req.path}`)
  })
  return app
}
