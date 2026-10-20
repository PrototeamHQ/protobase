import { Hono } from 'hono'
import { parseSize } from '@protobase/schema/internal'
import { isDatabaseError } from '../error-handler'
import { deleteBucket, findBucket, insertBucket, listBuckets, updateBucket, type BucketRow, type BucketWrite } from './bucket-sql'
import { checkedBucketId, objectKey } from './object-key'
import { deleteBucketObjects } from './object-sql'
import { asCaller } from './storage-db'
import { jsonBody, type StorageRoutesDeps } from './storage-context'
import { bucketNotEmpty, bucketNotFound, invalidRequest } from './storage-error'
import { ownerOf } from './write-object'

// A bucket as Supabase Storage lists it.
const bucketJson = (bucket: BucketRow) => ({ ...bucket, type: 'STANDARD' })

// `file_size_limit` as storage-js sends it: bytes, or text such as `1MB`; null for none.
const sizeLimit = (value: unknown) => {
  if (value === null) return null
  if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) return value
  if (typeof value === 'string' && /^\s*\d+(\.\d+)?\s*(b|kb|mb|gb)?\s*$/i.test(value)) return parseSize(value)
  throw invalidRequest('file_size_limit must be a number of bytes or a size such as 1MB')
}

// What a create or update body sets; a field left out keeps its value.
const bucketWrite = (body: Record<string, unknown>): BucketWrite => {
  const types = body.allowed_mime_types
  if (types !== undefined && types !== null && !(Array.isArray(types) && types.every((type) => typeof type === 'string'))) throw invalidRequest('allowed_mime_types must be a list of media types')
  if (body.public !== undefined && typeof body.public !== 'boolean') throw invalidRequest('public must be true or false')
  return {
    ...(body.public !== undefined && { public: body.public }),
    ...(body.file_size_limit !== undefined && { file_size_limit: sizeLimit(body.file_size_limit) }),
    ...(types !== undefined && { allowed_mime_types: types as string[] | null }),
  }
}

/** `supabase.storage`'s bucket calls, each as the caller, so the restored `storage.buckets` policies decide. */
export const bucketRoutes = (deps: StorageRoutesDeps) => {
  const app = new Hono()

  app.get('/bucket', async (c) => c.json((await asCaller(deps, await deps.caller(c.req.raw), true, listBuckets)).map(bucketJson)))

  app.get('/bucket/:id', async (c) => {
    const id = checkedBucketId(c.req.param('id'))
    const bucket = await asCaller(deps, await deps.caller(c.req.raw), true, (trx) => findBucket(trx, id))
    if (!bucket) throw bucketNotFound()
    return c.json(bucketJson(bucket))
  })

  app.post('/bucket', async (c) => {
    const body = await jsonBody(c)
    const name = checkedBucketId(typeof body.name === 'string' ? body.name : '')
    const id = typeof body.id === 'string' ? checkedBucketId(body.id) : name
    const caller = await deps.caller(c.req.raw)
    await asCaller(deps, caller, false, (trx) => insertBucket(trx, { id, name, owner: ownerOf(caller), ...bucketWrite(body) }))
    return c.json({ name: id })
  })

  app.put('/bucket/:id', async (c) => {
    const id = checkedBucketId(c.req.param('id'))
    const write = bucketWrite(await jsonBody(c))
    if (!(await asCaller(deps, await deps.caller(c.req.raw), false, (trx) => updateBucket(trx, id, write)))) throw bucketNotFound()
    return c.json({ message: 'Successfully updated' })
  })

  app.post('/bucket/:id/empty', async (c) => {
    const id = checkedBucketId(c.req.param('id'))
    const deleted = await asCaller(deps, await deps.caller(c.req.raw), false, (trx) => deleteBucketObjects(trx, id))
    for (const row of deleted) await deps.store.delete(await objectKey(row.bucket_id, row.name, row.version))
    return c.json({ message: 'Successfully emptied' })
  })

  app.delete('/bucket/:id', async (c) => {
    const id = checkedBucketId(c.req.param('id'))
    const deleting = asCaller(deps, await deps.caller(c.req.raw), false, (trx) => deleteBucket(trx, id))
    // Objects still referencing the bucket (23503): Supabase asks to empty it first.
    const deleted = await deleting.catch((error: unknown) => {
      if (isDatabaseError(error) && error.code === '23503') throw bucketNotEmpty()
      throw error
    })
    if (!deleted) throw bucketNotFound()
    return c.json({ message: 'Successfully deleted' })
  })

  return app
}
