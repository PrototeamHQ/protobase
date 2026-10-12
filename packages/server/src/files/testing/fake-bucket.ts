import type { S3Bucket } from '../s3-files'

type FakeObject = { bytes: Uint8Array<ArrayBuffer>; type: string; disposition: string; modified: Date }

/**
 * An in-memory bucket behaving as Bun's S3 client does against a real one: a write that fails stores nothing, `stat` of a
 * missing key throws `NoSuchKey`, `slice` excludes its end, and `list` pages `pageSize` keys at a time.
 */
export const fakeBucket = (pageSize = 2) => {
  const objects = new Map<string, FakeObject>()
  const missing = () => Object.assign(new Error('The specified key does not exist.'), { code: 'NoSuchKey' })
  const existing = (key: string) => {
    const object = objects.get(key)
    if (!object) throw missing()
    return object
  }

  const bucket: S3Bucket = {
    file: (key) => ({
      write: async (body, options) => {
        const bytes = new Uint8Array(await body.arrayBuffer())
        objects.set(key, { bytes, type: options.type, disposition: options.contentDisposition, modified: new Date() })
        return bytes.length
      },
      stat: async () => {
        const object = existing(key)
        return { size: object.bytes.length, lastModified: object.modified }
      },
      slice: (start, end) => ({ stream: () => new Blob([existing(key).bytes.slice(start, end)]).stream() }),
      stream: () => new Blob([existing(key).bytes]).stream(),
      delete: async () => {
        objects.delete(key)
      },
      presign: (options) => {
        const query = new URLSearchParams({ 'X-Amz-Expires': String(options.expiresIn), 'response-content-type': options.type, 'response-content-disposition': options.contentDisposition })
        return `https://bucket.example.com/${key}?${query}`
      },
    }),
    list: async ({ prefix, continuationToken }) => {
      const keys = [...objects.keys()].filter((key) => key.startsWith(prefix)).sort()
      const start = continuationToken === undefined ? 0 : Number(continuationToken)
      const page = keys.slice(start, start + pageSize)
      const isTruncated = start + pageSize < keys.length
      return {
        contents: page.map((key) => ({ key, size: objects.get(key)!.bytes.length, lastModified: objects.get(key)!.modified.toISOString() })),
        isTruncated,
        ...(isTruncated && { nextContinuationToken: String(start + pageSize) }),
      }
    },
  }
  return { bucket, objects }
}
