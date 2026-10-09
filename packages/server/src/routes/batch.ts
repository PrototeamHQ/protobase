import { Hono } from 'hono'
import { batchBody } from '../batch/schema'
import { runBatch } from '../batch/run-batch'
import type { Deps } from '../deps'
import type { Meta } from '../meta'
import { parseParams } from '../params'
import type { AdminEnv, Authenticator } from '../types'

/**
 * `POST /api/v1:batchWrite`. It sits beside the API's own app, not inside it: the method name is glued to the version
 * segment, so the route is registered on the root with the full path and authenticates itself.
 */
export const batchRoute = (deps: Deps, authenticate: Authenticator, meta: Meta) => {
  const app = new Hono<AdminEnv>()
  app.post(`${deps.basePath}:batchWrite`, async (c) => {
    const session = await authenticate(c.req.raw)
    const { ops } = parseParams(batchBody, await c.req.json())
    const results = await runBatch(deps, session, ops)
    return c.json({ results }, 200, { 'X-Meta-Version': await meta.version(session.user.roles) })
  })
  return app
}
