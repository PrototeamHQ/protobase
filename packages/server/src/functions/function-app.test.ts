import { describe, expect, it, vi } from 'vitest'
import type { Db } from '@protobase/query'
import { createErrorHandler } from '../error-handler'
import { forbidden } from '../problem'
import { defineFunction } from './define-function'
import { functionApp, type PublicFunctionEnv } from './function-app'
import { functionRoutes } from './routes'

const serveApp = (app: ReturnType<typeof functionApp<PublicFunctionEnv>>, onUnhandledError = vi.fn()) => ({
  routes: functionRoutes({
    basePath: '/api/functions',
    functions: { shop: defineFunction({ public: true }, app) },
    authenticate: () => ({ user: { id: 1, roles: [] } }),
    db: {} as Db,
    records: () => ({}) as never,
    onError: createErrorHandler(onUnhandledError),
  }),
  onUnhandledError,
})

describe('functionApp', () => {
  it('leaves its errors and unknown paths to the app, as problems and reported 500s', async () => {
    const app = functionApp<PublicFunctionEnv>()
    app.get('/items', (c) => c.json({ function: c.env.name }))
    app.get('/closed', () => {
      throw forbidden('closed', 'The shop is closed')
    })
    app.get('/broken', () => {
      throw new Error('boom')
    })
    const { routes, onUnhandledError } = serveApp(app)

    expect(await (await routes.request('/api/functions/shop/items')).json()).toEqual({ function: 'shop' })
    const closed = await routes.request('/api/functions/shop/closed')
    expect([closed.status, closed.headers.get('content-type'), (await closed.json()).detail]).toEqual([403, 'application/problem+json', 'The shop is closed'])
    const missing = await routes.request('/api/functions/shop/nothing')
    expect([missing.status, (await missing.json()).detail]).toEqual([404, 'There is no route at /nothing'])
    expect((await routes.request('/api/functions/shop/broken')).status).toBe(500)
    expect(onUnhandledError).toHaveBeenCalledWith(new Error('boom'))
  })
})
