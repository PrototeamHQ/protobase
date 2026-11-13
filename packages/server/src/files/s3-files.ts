import { parseSize } from '@protobase/schema/internal'
import { parseDuration } from './duration'
import { limitedFileStore, type FileLimits } from './limits'
import { contentDisposition, servedType } from './media-types'
import type { FileProvider, FileStore, StoredObject } from './store'

/** The part of Bun's `S3Client` the store uses, so tests can pass their own. */
export type S3Bucket = {
  file(key: string): S3Object
  list(input: { prefix: string; maxKeys?: number; continuationToken?: string }): Promise<S3ListPage>
}

export type S3Object = {
  /** Bytes written. A streamed body goes up in parts, and an upload that fails leaves no object. */
  write(body: Response, options: { type: string; contentDisposition: string }): Promise<number>
  stat(): Promise<{ size: number; lastModified: Date }>
  /** The bytes from `start` up to, not including, `end`. */
  slice(start: number, end: number): { stream(): ReadableStream<Uint8Array> }
  stream(): ReadableStream<Uint8Array>
  delete(): Promise<void>
  /** A GET link, served with the given Content-Type and Content-Disposition. */
  presign(options: { expiresIn: number; type: string; contentDisposition: string }): string
}

export type S3ListPage = {
  contents?: Array<{ key: string; size?: number; lastModified?: string }>
  isTruncated?: boolean
  nextContinuationToken?: string
}

export type S3FilesOptions = FileLimits & {
  bucket: string
  /** The folder in the bucket that holds this provider's files, such as `acme/private`; default the bucket's root. */
  prefix?: string
  /** The S3 API's address, such as `https://<account>.eu.r2.cloudflarestorage.com`; default AWS. */
  endpoint?: string
  /** `auto` for R2, `fr-par` for Scaleway in Paris. */
  region?: string
  /** Default `S3_ACCESS_KEY_ID`, then `AWS_ACCESS_KEY_ID`, from the environment. */
  accessKeyId?: string
  /** Default `S3_SECRET_ACCESS_KEY`, then `AWS_SECRET_ACCESS_KEY`, from the environment. */
  secretAccessKey?: string
  /** Files anyone with the link may open. */
  public?: boolean
  /** The bucket's public address, such as an R2 custom domain; public files are linked from there, under `prefix`. */
  publicUrl?: string
  /** How long bytes outlive their last reference; default `files.retention`, or 0 for a public provider. */
  retention?: number | string
}

const codeOf = (error: unknown) => (error instanceof Error ? (error as { code?: unknown }).code : undefined)

/** A store in a bucket, under `prefix`. Downloads get presigned links, so their bytes never pass through the app. */
export const s3FileStore = (bucket: S3Bucket, prefix = ''): FileStore => {
  const trimmed = prefix.replace(/^\/+|\/+$/g, '')
  const root = trimmed === '' ? '' : `${trimmed}/`
  const keyOf = (path: string) => `${root}${path}`

  // The size a listing holds for exactly `key`, or `undefined` when it is gone: a key sorts before every longer key it
  // starts.
  const listedSize = async (key: string) => {
    const item = (await bucket.list({ prefix: key, maxKeys: 1 })).contents?.[0]
    if (item?.key !== key) return
    if (item.size === undefined) throw new Error(`Listing "${key}" gave no size`)
    return item.size
  }

  // Bun's `stat` takes the size from the HEAD's Content-Length and gives 0 when it has none, as a compressing front
  // answers a compressible type for a client that accepts gzip, which Bun always does. So a size of 0 is checked against
  // the listing, which holds the stored size.
  const head = async (path: string): Promise<StoredObject | undefined> => {
    const key = keyOf(path)
    try {
      const stat = await bucket.file(key).stat()
      const size = stat.size > 0 ? stat.size : await listedSize(key)
      if (size === undefined) return
      return { path, size, modified: stat.lastModified }
    } catch (error) {
      if (codeOf(error) === 'NoSuchKey' || codeOf(error) === 'NotFound') return undefined
      throw error
    }
  }

  // Stored with the type the upload was decided to be, else the one its path is served as, and named by its path, for
  // public files a bucket serves itself.
  const put = async (path: string, body: ReadableStream<Uint8Array>, options?: { type?: string }) => {
    const type = options?.type ?? servedType(path)
    const name = path.slice(path.lastIndexOf('/') + 1)
    const size = await bucket.file(keyOf(path)).write(new Response(body), { type, contentDisposition: contentDisposition(name, type) })
    return { size }
  }

  const read = async (path: string, range?: { start: number; end: number }) => {
    if (!(await head(path))) return undefined
    const file = bucket.file(keyOf(path))
    return range ? file.slice(range.start, range.end + 1).stream() : file.stream()
  }

  const remove = (path: string) => bucket.file(keyOf(path)).delete()

  const list = async (folder: string) => {
    const found: StoredObject[] = []
    let continuationToken: string | undefined
    do {
      const page = await bucket.list({ prefix: keyOf(folder), ...(continuationToken !== undefined && { continuationToken }) })
      for (const item of page.contents ?? []) {
        // A key ending in `/` is a folder marker some consoles create, not a file.
        if (item.key.endsWith('/')) continue
        found.push({ path: item.key.slice(root.length), size: item.size ?? 0, modified: new Date(item.lastModified ?? 0) })
      }
      if (page.isTruncated && !page.nextContinuationToken) throw new Error(`Listing "${keyOf(folder)}" stopped without a continuation token`)
      continuationToken = page.isTruncated ? page.nextContinuationToken : undefined
    } while (continuationToken !== undefined)
    return found.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
  }

  const downloadUrl = async (path: string, options: { expires: number; type: string; disposition: string }) => {
    const expiresIn = Math.max(options.expires - Math.floor(Date.now() / 1000), 1)
    return bucket.file(keyOf(path)).presign({ expiresIn, type: options.type, contentDisposition: options.disposition })
  }

  return { put, head, read, delete: remove, list, downloadUrl }
}

type BunS3 = { S3Client: new (options: Record<string, string>) => S3Bucket }

// Created on first use: loading the config, as `protobase doctor` does on Node, never needs Bun.
const bunBucket = (options: Record<string, string>): S3Bucket => {
  let client: S3Bucket | undefined
  const connect = () => {
    if (client) return client
    const bun = (globalThis as { Bun?: BunS3 }).Bun
    // Bun's client streams uploads in parts, lists and presigns; Node has none built in.
    if (!bun) throw new Error('Not implemented: S3 file providers need Bun; serve the app with protobase-serve.js or the protobase image')
    client = new bun.S3Client(options)
    return client
  }
  return { file: (key) => connect().file(key), list: (input) => connect().list(input) }
}

/** A provider in an S3-compatible bucket, such as Cloudflare R2 or Scaleway: `s3Files({ bucket: 'acme-files', ... })`. */
export const s3Files = (options: S3FilesOptions): FileProvider => {
  const { bucket, prefix = '', endpoint, region, accessKeyId, secretAccessKey, public: isPublic = false, publicUrl, retention, maxBytes, maxFiles } = options
  if (!bucket) throw new Error('s3Files needs a bucket')
  const client = bunBucket({
    bucket,
    ...(endpoint !== undefined && { endpoint }),
    ...(region !== undefined && { region }),
    ...(accessKeyId !== undefined && { accessKeyId }),
    ...(secretAccessKey !== undefined && { secretAccessKey }),
  })
  const folder = prefix.replace(/^\/+|\/+$/g, '')
  return {
    store: limitedFileStore(s3FileStore(client, folder), { maxBytes, maxFiles }),
    public: isPublic || publicUrl !== undefined,
    ...(publicUrl !== undefined && { publicUrl: `${publicUrl.replace(/\/$/, '')}${folder === '' ? '' : `/${folder}`}` }),
    ...(retention !== undefined && { retention: parseDuration(retention, 'retention') }),
    ...(maxBytes !== undefined && { maxBytes: parseSize(maxBytes) }),
  }
}
