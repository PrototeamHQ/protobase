import { rangeOf } from '../files/download'
import { octetStream } from '../files/media-types'
import type { FileStore } from '../files/store'
import { HttpProblem } from '../problem'
import { objectKey } from './object-key'
import type { ObjectRow } from './object-sql'
import { objectNotFound } from './storage-error'

// `attachment`, named as `?download=` says or after the object, as Supabase Storage sends it; nothing without it.
const disposition = (download: string | null, name: string): Record<string, string> => {
  if (download === null) return {}
  const fileName = download || name.slice(name.lastIndexOf('/') + 1)
  const ascii = fileName.replace(/[^\x20-\x7e]|["\\]/g, '_')
  return { 'content-disposition': `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}` }
}

/**
 * The bytes of an object, or the one range asked for, with the type, cache control and ETag it was uploaded with. The
 * type is the uploader's, as on Supabase, so nothing on the app's own origin may run: `nosniff` and a sandboxing CSP.
 */
export const serveObject = async (store: FileStore, row: ObjectRow, request: Request) => {
  const key = await objectKey(row.bucket_id, row.name, row.version)
  const object = await store.head(key)
  if (!object) throw objectNotFound()
  const headers: Record<string, string> = {
    'content-type': row.metadata?.mimetype ?? octetStream,
    'cache-control': row.metadata?.cacheControl ?? 'no-cache',
    ...(row.metadata?.eTag && { etag: row.metadata.eTag }),
    'last-modified': row.updated_at.toUTCString(),
    'accept-ranges': 'bytes',
    'x-content-type-options': 'nosniff',
    'content-security-policy': "sandbox; default-src 'none'",
    ...disposition(new URL(request.url).searchParams.get('download'), row.name),
  }
  const range = rangeOf(request.headers.get('range'), object.size)
  if (range === false) throw new HttpProblem(416, 'range-not-satisfiable', 'Range Not Satisfiable', 'The requested range is outside the object', {}, { 'content-range': `bytes */${object.size}` })
  const body = await store.read(key, range)
  if (!body) throw objectNotFound()
  if (!range) return new Response(body, { status: 200, headers: { ...headers, 'content-length': String(object.size) } })
  return new Response(body, { status: 206, headers: { ...headers, 'content-length': String(range.end - range.start + 1), 'content-range': `bytes ${range.start}-${range.end}/${object.size}` } })
}
