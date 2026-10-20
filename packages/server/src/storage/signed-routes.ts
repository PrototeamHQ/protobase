import { Hono } from 'hono'
import { checkedBucketId } from './object-key'
import { findObject, visibleNames } from './object-sql'
import { serveObject } from './serve-object'
import { asApp, asCaller } from './storage-db'
import { addressOf, jsonBody, type StorageRoutesDeps } from './storage-context'
import { invalidRequest, objectNotFound } from './storage-error'
import { readGrant, signGrant } from './storage-token'
import { visibleObject } from './move-copy'
import { uploadObject } from './upload-object'
import { ownerOf, probeWrite } from './write-object'

// A signed upload URL lasts two hours, as on Supabase.
const uploadSeconds = 2 * 60 * 60

const expiresIn = (body: Record<string, unknown>) => {
  const seconds = body.expiresIn
  if (typeof seconds !== 'number' || !Number.isSafeInteger(seconds) || seconds < 1) throw invalidRequest('expiresIn must be a whole number of seconds, at least 1')
  return Math.floor(Date.now() / 1000) + seconds
}

const queryToken = (request: Request) => new URL(request.url).searchParams.get('token') ?? ''

/**
 * Signed URLs: the caller signs a download of an object it may read, or an upload it may write, and anyone with the
 * URL then reads or writes that one object until it expires, without a key.
 */
export const signedRoutes = (deps: StorageRoutesDeps) => {
  const app = new Hono()

  app.post('/object/sign/:bucket/:name{.+}', async (c) => {
    const { bucket, name } = addressOf(c)
    const expires = expiresIn(await jsonBody(c))
    await visibleObject(deps, await deps.caller(c.req.raw), { bucket, name })
    const token = await signGrant(deps.signer, 'storage-download', { bucket, name, expires })
    return c.json({ signedURL: `/object/sign/${bucket}/${name}?token=${token}` })
  })

  // `createSignedUrls()`: one entry per path, with an error for those the caller may not read.
  app.post('/object/sign/:bucket', async (c) => {
    const bucket = checkedBucketId(c.req.param('bucket'))
    const body = await jsonBody(c)
    const expires = expiresIn(body)
    if (!Array.isArray(body.paths) || !body.paths.every((path) => typeof path === 'string')) throw invalidRequest("body must have required property 'paths'")
    const paths = body.paths as string[]
    const caller = await deps.caller(c.req.raw)
    const visible = new Set(await asCaller(deps, caller, true, (trx) => visibleNames(trx, bucket, paths)))
    const signed = paths.map(async (path) => {
      if (!visible.has(path)) return { error: 'Either the object does not exist or you do not have access to it', path, signedURL: null }
      const token = await signGrant(deps.signer, 'storage-download', { bucket, name: path, expires })
      return { error: null, path, signedURL: `/object/sign/${bucket}/${path}?token=${token}` }
    })
    return c.json(await Promise.all(signed))
  })

  app.get('/object/sign/:bucket/:name{.+}', async (c) => {
    const { bucket, name } = addressOf(c)
    await readGrant(deps.signer, 'storage-download', queryToken(c.req.raw), { bucket, name })
    const row = await asApp(deps, (trx) => findObject(trx, bucket, name))
    if (!row) throw objectNotFound()
    return serveObject(deps.store, row, c.req.raw)
  })

  app.post('/object/upload/sign/:bucket/:name{.+}', async (c) => {
    const { bucket, name } = addressOf(c)
    const caller = await deps.caller(c.req.raw)
    const upsert = c.req.header('x-upsert') === 'true'
    await probeWrite(deps, { bucket, name, caller, owner: ownerOf(caller), upsert }, c.req.header('content-type') ?? 'application/octet-stream')
    const token = await signGrant(deps.signer, 'storage-upload', { bucket, name, owner: ownerOf(caller), upsert, expires: Math.floor(Date.now() / 1000) + uploadSeconds })
    return c.json({ url: `/object/upload/sign/${bucket}/${name}?token=${token}`, token })
  })

  // The upload a signed URL allows, written as the app for the user who signed it (`owner`), as Supabase Storage writes it.
  app.put('/object/upload/sign/:bucket/:name{.+}', async (c) => {
    const { bucket, name } = addressOf(c)
    const grant = await readGrant(deps.signer, 'storage-upload', queryToken(c.req.raw), { bucket, name })
    const appCaller = { role: 'app', claims: { role: 'service_role' } } as const
    const { Key } = await uploadObject(deps, c.req.raw, { bucket, name, caller: appCaller, owner: grant.owner, upsert: grant.upsert })
    return c.json({ Key })
  })

  return app
}
