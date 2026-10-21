import type { SourceObject } from './storage-objects'

/** Bytes in decimal megabytes, as `max_bytes=500MB` counts them. */
export const megabytes = (bytes: number) => `${(bytes / 1e6).toFixed(1)} MB`

export const objectCount = (count: number) => `${count} object${count === 1 ? '' : 's'}`

/** The bytes Supabase recorded for `objects`; an object without a recorded size counts as empty. */
export const totalBytes = (objects: SourceObject[]) => objects.reduce((sum, object) => sum + (object.size ?? 0), 0)

/** Each bucket's objects and bytes, as lines to print before the copy. */
export const bucketLines = (objects: SourceObject[]) => {
  const buckets = new Map<string, SourceObject[]>()
  for (const object of objects) buckets.set(object.bucket, [...(buckets.get(object.bucket) ?? []), object])
  return [...buckets].map(([bucket, inBucket]) => `  ${bucket}: ${objectCount(inBucket.length)}, ${megabytes(totalBytes(inBucket))}\n`)
}

/**
 * Why the copy stops before it starts, or `undefined` when it fits: the bytes still to copy (`todo`) and those the
 * store holds already (`used`) together exceed the provider's `maxBytes`.
 */
export const overQuota = (todo: number, used: number, maxBytes: number | undefined) => {
  if (maxBytes === undefined || todo + used <= maxBytes) return undefined
  return `The objects still to copy take ${megabytes(todo)} and the file provider holds ${megabytes(used)} already, more than its ${megabytes(maxBytes)}: pick a larger plan or raise its max_bytes, or pass --yes to copy until it is full`
}
