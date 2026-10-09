import { Hono } from 'hono'
import { ifNoneMatchSatisfied } from '../etag'
import type { Meta } from '../meta'
import type { AdminEnv } from '../types'

export const metaRoutes = (meta: Meta) => {
  const app = new Hono<AdminEnv>()
  app.get('/meta', async (c) => {
    const { body, etag } = await meta.forCaller(c.get('session'))
    const headers = { ETag: etag, 'Cache-Control': 'no-cache' }
    const given = c.req.header('if-none-match')
    if (given && ifNoneMatchSatisfied(given, etag)) return new Response(null, { status: 304, headers })
    return c.json(body, 200, headers)
  })
  return app
}
