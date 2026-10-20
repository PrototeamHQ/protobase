import { Hono } from 'hono'
import { listFolder, type ListQuery } from './list-sql'
import { checkedBucketId, checkedName, objectKey } from './object-key'
import { deleteObjects, findPublicObject } from './object-sql'
import { serveObject } from './serve-object'
import { asApp, asCaller } from './storage-db'
import { addressOf, jsonBody, stringField, type StorageRoutesDeps } from './storage-context'
import { invalidRequest, objectNotFound } from './storage-error'
import { copyObject, moveObject, visibleObject } from './move-copy'
import { uploadObject } from './upload-object'
import { ownerOf } from './write-object'

const sortColumns = new Set<ListQuery['column']>(['name', 'updated_at', 'created_at', 'last_accessed_at'])

// `list()`'s body: storage-js sends every field, with its defaults.
const listQuery = (body: Record<string, unknown>): ListQuery => {
  const prefix = typeof body.prefix === 'string' ? body.prefix : ''
  const sortBy = (typeof body.sortBy === 'object' && body.sortBy !== null ? body.sortBy : {}) as { column?: unknown; order?: unknown }
  const column = typeof sortBy.column === 'string' && sortColumns.has(sortBy.column as ListQuery['column']) ? (sortBy.column as ListQuery['column']) : 'name'
  const count = (value: unknown, fallback: number) => (Number.isSafeInteger(value) && (value as number) >= 0 ? (value as number) : fallback)
  return {
    prefix: prefix === '' || prefix.endsWith('/') ? prefix : `${prefix}/`,
    search: typeof body.search === 'string' ? body.search : '',
    limit: Math.min(count(body.limit, 100), 1000),
    offset: count(body.offset, 0),
    column,
    order: sortBy.order === 'desc' ? 'desc' : 'asc',
  }
}

/** The routes of objects that the caller's role reaches: upload, download, delete, info, list, move and copy, and public objects. */
export const objectRoutes = (deps: StorageRoutesDeps) => {
  const app = new Hono()

  app.get('/object/public/:bucket/:name{.+}', async (c) => {
    const { bucket, name } = addressOf(c)
    const row = await asApp(deps, (trx) => findPublicObject(trx, bucket, name))
    if (!row) throw objectNotFound()
    return serveObject(deps.store, row, c.req.raw)
  })

  app.post('/object/list/:bucket', async (c) => {
    const bucket = checkedBucketId(c.req.param('bucket'))
    const query = listQuery(await jsonBody(c))
    const caller = await deps.caller(c.req.raw)
    return c.json(await asCaller(deps, caller, true, (trx) => listFolder(trx, bucket, query)))
  })

  app.post('/object/move', async (c) => {
    const body = await jsonBody(c)
    const caller = await deps.caller(c.req.raw)
    const from = { bucket: checkedBucketId(stringField(body, 'bucketId')), name: checkedName(stringField(body, 'sourceKey')) }
    const to = { bucket: checkedBucketId(typeof body.destinationBucket === 'string' ? body.destinationBucket : from.bucket), name: checkedName(stringField(body, 'destinationKey')) }
    const id = await moveObject(deps, caller, from, to)
    return c.json({ message: 'Successfully moved', Id: id, Key: to.name })
  })

  app.post('/object/copy', async (c) => {
    const body = await jsonBody(c)
    const caller = await deps.caller(c.req.raw)
    const from = { bucket: checkedBucketId(stringField(body, 'bucketId')), name: checkedName(stringField(body, 'sourceKey')) }
    const to = { bucket: checkedBucketId(typeof body.destinationBucket === 'string' ? body.destinationBucket : from.bucket), name: checkedName(stringField(body, 'destinationKey')) }
    const { id } = await copyObject(deps, caller, from, to, c.req.header('x-upsert') === 'true')
    return c.json({ Id: id, Key: `${to.bucket}/${to.name}` })
  })

  app.get('/object/info/:bucket/:name{.+}', async (c) => {
    const row = await visibleObject(deps, await deps.caller(c.req.raw), addressOf(c))
    return c.json({
      id: row.id, name: row.name, version: row.version, bucket_id: row.bucket_id, size: row.metadata?.size ?? null,
      content_type: row.metadata?.mimetype ?? null, cache_control: row.metadata?.cacheControl ?? null, etag: row.metadata?.eTag ?? null,
      metadata: row.user_metadata, last_modified: row.updated_at, created_at: row.created_at,
    })
  })

  // Before `/object/:bucket/:name`, which would take `authenticated` for a bucket.
  for (const path of ['/object/authenticated/:bucket/:name{.+}', '/object/:bucket/:name{.+}']) {
    app.get(path, async (c) => serveObject(deps.store, await visibleObject(deps, await deps.caller(c.req.raw), addressOf(c)), c.req.raw))
  }

  // `upload()` posts, with `x-upsert`; `update()` puts, which replaces.
  app.on(['POST', 'PUT'], '/object/:bucket/:name{.+}', async (c) => {
    const caller = await deps.caller(c.req.raw)
    const upsert = c.req.method === 'PUT' || c.req.header('x-upsert') === 'true'
    return c.json(await uploadObject(deps, c.req.raw, { ...addressOf(c), caller, owner: ownerOf(caller), upsert }))
  })

  // `remove()`: the objects the caller may delete are deleted and listed; the others are left, as on Supabase.
  app.delete('/object/:bucket', async (c) => {
    const bucket = checkedBucketId(c.req.param('bucket'))
    const prefixes = (await jsonBody(c)).prefixes
    if (!Array.isArray(prefixes) || !prefixes.every((name) => typeof name === 'string')) throw invalidRequest("body must have required property 'prefixes'")
    const caller = await deps.caller(c.req.raw)
    const deleted = await asCaller(deps, caller, false, (trx) => deleteObjects(trx, bucket, prefixes as string[]))
    for (const row of deleted) await deps.store.delete(await objectKey(row.bucket_id, row.name, row.version))
    return c.json(deleted)
  })

  app.delete('/object/:bucket/:name{.+}', async (c) => {
    const { bucket, name } = addressOf(c)
    const caller = await deps.caller(c.req.raw)
    const [deleted] = await asCaller(deps, caller, false, (trx) => deleteObjects(trx, bucket, [name]))
    if (!deleted) throw objectNotFound()
    await deps.store.delete(await objectKey(deleted.bucket_id, deleted.name, deleted.version))
    return c.json({ message: 'Successfully deleted' })
  })

  return app
}
