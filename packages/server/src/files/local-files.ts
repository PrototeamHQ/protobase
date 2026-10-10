import { HttpProblem } from '../problem'
import { parseDuration } from './duration'
import type { FileProvider, FileStore, StoredObject } from './store'

// Loaded on first use, so the server still starts where there is no file system (Workers).
const node = async () => ({
  fs: await import('node:fs/promises'),
  streams: await import('node:fs'),
  path: await import('node:path'),
  stream: await import('node:stream'),
  pipeline: (await import('node:stream/promises')).pipeline,
  crypto: await import('node:crypto'),
})

const codeOf = (error: unknown) => (error instanceof Error ? (error as { code?: unknown }).code : undefined)

// A full disk, or a full quota: XFS project quotas answer ENOSPC, ext4 and user quotas EDQUOT.
const storageFull = () => new HttpProblem(507, 'storage-full', 'Insufficient Storage', 'There is no room left to store this file')

export type LocalFilesOptions = {
  /** The folder the files live in, created when missing; relative to the working directory. */
  dir: string
  /** Files anyone with the link may open, served without a signature. */
  public?: boolean
  /** Where public files are linked from instead of the app's own `/api/files/<provider>`, such as a CDN in front of it. */
  publicUrl?: string
  /** How long bytes outlive their last reference; default `files.retention`, or 0 for a public provider. */
  retention?: number | string
}

/** A store in a folder on local disk. Writes go to `.tmp/` first and are renamed into place, so they are atomic. */
export const localFileStore = (dir: string): FileStore => {
  const resolve = async (relative: string) => {
    const { path } = await node()
    const root = path.resolve(dir)
    const full = path.resolve(root, relative)
    if (!full.startsWith(`${root}${path.sep}`)) throw new Error(`"${relative}" is outside the file store`)
    return full
  }

  const head = async (relative: string): Promise<StoredObject | undefined> => {
    const { fs } = await node()
    try {
      const stat = await fs.stat(await resolve(relative))
      return stat.isFile() ? { path: relative, size: stat.size, modified: stat.mtime } : undefined
    } catch (error) {
      if (codeOf(error) === 'ENOENT' || codeOf(error) === 'ENOTDIR') return undefined
      throw error
    }
  }

  const put = async (relative: string, body: ReadableStream<Uint8Array>) => {
    const { fs, streams, path, stream, pipeline, crypto } = await node()
    const full = await resolve(relative)
    const temporary = await resolve(`.tmp/${crypto.randomUUID()}`)
    await fs.mkdir(path.dirname(temporary), { recursive: true })
    await fs.mkdir(path.dirname(full), { recursive: true })
    try {
      // Writable.toWeb() would buffer the whole body on Node; a pipeline streams it.
      await pipeline(stream.Readable.fromWeb(body as import('node:stream/web').ReadableStream<Uint8Array>), streams.createWriteStream(temporary, { flags: 'wx' }))
      await fs.rename(temporary, full)
    } catch (error) {
      await fs.rm(temporary, { force: true })
      if (codeOf(error) === 'ENOSPC' || codeOf(error) === 'EDQUOT') throw storageFull()
      throw error
    }
    return { size: (await fs.stat(full)).size }
  }

  const read = async (relative: string, range?: { start: number; end: number }) => {
    const { streams, stream } = await node()
    if (!(await head(relative))) return undefined
    const reader = streams.createReadStream(await resolve(relative), range ? { start: range.start, end: range.end } : {})
    return stream.Readable.toWeb(reader) as unknown as ReadableStream<Uint8Array>
  }

  const remove = async (relative: string) => {
    const { fs } = await node()
    await fs.rm(await resolve(relative), { force: true })
  }

  const list = async (prefix: string) => {
    const { fs, path } = await node()
    const root = path.resolve(dir)
    const folder = await resolve(prefix.replace(/\/$/, ''))
    let names: string[]
    try {
      names = await fs.readdir(folder, { recursive: true })
    } catch (error) {
      if (codeOf(error) === 'ENOENT') return []
      throw error
    }
    const found: StoredObject[] = []
    for (const name of names) {
      const relative = path.relative(root, path.join(folder, name)).split(path.sep).join('/')
      const object = await head(relative)
      if (object) found.push(object)
    }
    return found.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
  }

  return { put, head, read, delete: remove, list }
}

/** A provider on local disk: `localFiles({ dir: './data/files/private' })`. */
export const localFiles = ({ dir, public: isPublic = false, publicUrl, retention }: LocalFilesOptions): FileProvider => ({
  store: localFileStore(dir),
  public: isPublic || publicUrl !== undefined,
  ...(publicUrl !== undefined && { publicUrl: publicUrl.replace(/\/$/, '') }),
  ...(retention !== undefined && { retention: parseDuration(retention, 'retention') }),
})
