import type { SourceObject } from './storage-objects'

// An ETag that is the MD5 of the bytes: S3's for a single upload. A multipart upload's (`<md5>-<parts>`) is not.
const md5ETag = /^"?([0-9a-f]{32})"?$/i

/** Whether a copy already in the store, of `storedSize` bytes, is the object's, so a rerun skips it. */
export const alreadyCopied = (object: SourceObject, storedSize: number | undefined) => storedSize !== undefined && (object.size === undefined || storedSize === object.size)

/**
 * What is wrong with a copy, or `undefined` when it is the object's: the bytes read (`read`, with their MD5) and those
 * the store holds after the write (`stored`) must be the size Supabase recorded, and the MD5 its ETag where that is one.
 */
export const copyFault = (object: SourceObject, read: { size: number; md5: string }, stored: number | undefined) => {
  if (object.size !== undefined && read.size !== object.size) return `read ${read.size} bytes, Supabase recorded ${object.size}`
  if (stored !== read.size) return `the file provider holds ${stored ?? 'no'} bytes of the ${read.size} written`
  const etag = object.eTag?.match(md5ETag)?.[1]?.toLowerCase()
  if (etag && etag !== read.md5) return `MD5 ${read.md5} differs from the ETag ${etag}`
  return undefined
}
