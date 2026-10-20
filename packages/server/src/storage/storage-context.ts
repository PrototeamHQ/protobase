import type { Context } from 'hono'
import type { Caller } from '../api-keys/resolve-caller'
import { checkedBucketId, checkedName } from './object-key'
import { invalidRequest } from './storage-error'
import type { StorageDeps } from './storage-db'

/** What the routes are built from: the storage deps, and who a request runs as, from its `apikey` and bearer. */
export type StorageRoutesDeps = StorageDeps & { caller: (request: Request) => Promise<Caller> }

/** The object a route's `:bucket` and `:name{.+}` address, both checked. */
export const addressOf = (c: Context) => ({ bucket: checkedBucketId(c.req.param('bucket')!), name: checkedName(c.req.param('name')!) })

/** The JSON object of a request's body, else 400. */
export const jsonBody = async (c: Context): Promise<Record<string, unknown>> => {
  const body: unknown = await c.req.json().catch((error: unknown) => {
    if (error instanceof SyntaxError) return undefined
    throw error
  })
  if (typeof body !== 'object' || body === null || Array.isArray(body)) throw invalidRequest('The body is not a JSON object')
  return body as Record<string, unknown>
}

/** A string field of a body, else 400 naming it. */
export const stringField = (body: Record<string, unknown>, name: string) => {
  const value = body[name]
  if (typeof value !== 'string') throw invalidRequest(`body must have required property '${name}'`)
  return value
}
