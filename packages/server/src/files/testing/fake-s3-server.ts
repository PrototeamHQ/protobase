import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'

type FakeObject = { bytes: Uint8Array<ArrayBuffer>; type: string }

const compressible = (type: string) => type.split(';')[0] === 'application/json' || type.startsWith('text/')
const escapeXml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;')

/**
 * An S3-compatible bucket over HTTP, in memory and path-style (`/<bucket>/<key>`), for Bun's S3 client. Its HEAD answers
 * as a compressing front before a bucket does for a compressible type asked for with gzip: without Content-Length.
 * GET and the listing (`list-type=2` with `prefix` and `max-keys`) hold the stored bytes and sizes.
 */
export const fakeS3Server = async () => {
  const objects = new Map<string, FakeObject>()

  const listing = (bucket: string, prefix: string, maxKeys: number) => {
    const keys = [...objects.keys()].filter((key) => key.startsWith(`/${bucket}/${prefix}`)).sort().slice(0, maxKeys)
    const items = keys.map((key) => `<Contents><Key>${escapeXml(key.slice(bucket.length + 2))}</Key><Size>${objects.get(key)!.bytes.length}</Size><LastModified>2026-01-01T00:00:00.000Z</LastModified><ETag>"e"</ETag></Contents>`)
    return `<?xml version="1.0" encoding="UTF-8"?><ListBucketResult><Name>${bucket}</Name><Prefix>${escapeXml(prefix)}</Prefix><KeyCount>${items.length}</KeyCount><MaxKeys>${maxKeys}</MaxKeys><IsTruncated>false</IsTruncated>${items.join('')}</ListBucketResult>`
  }

  const server = createServer((request, response) => {
    const url = new URL(request.url!, 'http://localhost')
    const key = decodeURIComponent(url.pathname)
    if (request.method === 'GET' && url.searchParams.get('list-type') === '2') {
      response.writeHead(200, { 'content-type': 'application/xml' })
      response.end(listing(key.split('/')[1]!, url.searchParams.get('prefix') ?? '', Number(url.searchParams.get('max-keys') ?? 1000)))
      return
    }
    const object = objects.get(key)
    if (!object) {
      response.writeHead(404, { 'content-type': 'application/xml' })
      response.end(request.method === 'HEAD' ? undefined : '<Error><Code>NoSuchKey</Code></Error>')
      return
    }
    const headers = { 'content-type': object.type, etag: '"e"', 'last-modified': new Date(0).toUTCString() }
    if (request.method === 'HEAD') {
      const gzip = request.headers['accept-encoding']?.includes('gzip') ?? false
      response.writeHead(200, gzip && compressible(object.type) ? headers : { ...headers, 'content-length': String(object.bytes.length) })
      response.end()
      return
    }
    const range = /^bytes=(\d+)-(\d+)$/.exec(request.headers.range ?? '')
    if (!range) {
      response.writeHead(200, { ...headers, 'content-length': String(object.bytes.length) })
      response.end(object.bytes)
      return
    }
    const part = object.bytes.slice(Number(range[1]), Number(range[2]) + 1)
    response.writeHead(206, { ...headers, 'content-length': String(part.length), 'content-range': `bytes ${range[1]}-${range[2]}/${object.bytes.length}` })
    response.end(part)
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))

  return {
    endpoint: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    /** Puts `bytes` at `key` of `bucket`, as an upload would have stored them. */
    put: (bucket: string, key: string, bytes: Uint8Array<ArrayBuffer>, type: string) => objects.set(`/${bucket}/${key}`, { bytes, type }),
    close: () => new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))),
  }
}
