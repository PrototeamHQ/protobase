import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import { devServiceWorkerCode } from '../build/service-worker-push-code'
import { devServiceWorkerPath, withDevServiceWorker } from './service-worker-route'

describe('the development worker', () => {
  it('is served with notifications() on, as JavaScript never cached', async () => {
    const response = await withDevServiceWorker(new Hono(), true).request(devServiceWorkerPath)
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('text/javascript; charset=utf-8')
    expect(response.headers.get('cache-control')).toBe('no-cache')
    expect(await response.text()).toBe(devServiceWorkerCode)
  })

  it('does not exist without notifications()', async () => {
    expect((await withDevServiceWorker(new Hono(), false).request(devServiceWorkerPath)).status).toBe(404)
  })
})
