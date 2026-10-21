import { Hono } from 'hono'
import { bucketRoutes } from './bucket-routes'
import { objectRoutes } from './object-routes'
import { signedRoutes } from './signed-routes'
import type { StorageRoutesDeps } from './storage-context'
import { errorResponse, StorageError, storageErrorOf } from './storage-error'

export type StorageRoutesInput = {
  deps: StorageRoutesDeps
  /** Called with every error that becomes a 500, and its request. */
  report?: (error: unknown, request?: Request) => void
}

/**
 * The Storage-compatible API `supabase.storage` calls, mounted at `/api/sb/storage/v1`, over the app's storage provider. Every
 * read and write of `storage.objects` and `storage.buckets` runs as the request's caller (`anon`, `authenticated` or
 * the app's own role), so the policies restored with them decide; public buckets and signed URLs need no key. Errors
 * come back as Supabase Storage's `{ statusCode, error, message }`; an unexpected one as a 500 that names nothing of it.
 */
export const storageRoutes = ({ deps, report }: StorageRoutesInput) => {
  const app = new Hono()
  app.onError((error, c) => {
    const known = storageErrorOf(error)
    if (known) return errorResponse(known)
    report?.(error, c.req.raw)
    return errorResponse(new StorageError(500, 'InternalError', 'Internal', 'Internal Server Error'))
  })
  app.route('/', signedRoutes(deps))
  app.route('/', objectRoutes(deps))
  app.route('/', bucketRoutes(deps))
  app.notFound(() => errorResponse(new StorageError(404, 'NotFound', 'not_found', 'Route not found')))
  return app
}
