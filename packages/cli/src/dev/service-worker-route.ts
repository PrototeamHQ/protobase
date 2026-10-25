import type { Hono } from 'hono'
import { serviceWorkerFile } from '@protobase/schema/internal'
import { devServiceWorkerCode } from '../build/service-worker-push-code'

/** Where `protobase dev` serves its worker, as the built shell serves its own. */
export const devServiceWorkerPath = `/${serviceWorkerFile}`

/**
 * Serves `protobase dev`'s worker, the push handlers alone (see `devServiceWorkerCode`), when the app has
 * `notifications()`, so push can be tried in development; without them the path is unknown and no worker registers.
 */
export const withDevServiceWorker = <A extends Hono>(app: A, notifications: boolean) => {
  if (notifications) app.get(devServiceWorkerPath, (c) => c.body(devServiceWorkerCode, 200, { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-cache' }))
  return app
}
