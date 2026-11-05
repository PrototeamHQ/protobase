import { mkdir, readFile, rm, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

/** A local copy of a run's files, read before the durable store; the copy may be gone, the durable one is what counts. */
export type ScratchFiles = { put(path: string, bytes: Uint8Array): Promise<void>; read(path: string): Promise<Uint8Array | undefined> }

const isMissing = (error: unknown) => error instanceof Error && (error as NodeJS.ErrnoException).code === 'ENOENT'

/**
 * Keeps up to `maxBytes` of files in a folder of its own under `dir`, the least recently used dropped first. The folder
 * is emptied as it starts, since files a former process left are counted by none.
 */
export const scratchFiles = ({ dir, maxBytes }: { dir: string; maxBytes: number }): ScratchFiles => {
  const folder = join(dir, 'protobase-workflows')
  let ready: Promise<unknown> | undefined
  const prepared = () => (ready ??= rm(folder, { recursive: true, force: true }).then(() => mkdir(folder, { recursive: true })))
  // Each kept file's size, in the order it was last used.
  const kept = new Map<string, number>()
  let total = 0
  const fileOf = (path: string) => join(folder, encodeURIComponent(path))
  const drop = async (path: string) => {
    total -= kept.get(path) ?? 0
    kept.delete(path)
    await unlink(fileOf(path)).catch((error: unknown) => {
      if (!isMissing(error)) throw error
    })
  }
  return {
    put: async (path, bytes) => {
      if (bytes.length > maxBytes) return
      await prepared()
      if (kept.has(path)) await drop(path)
      await writeFile(fileOf(path), bytes)
      kept.set(path, bytes.length)
      total += bytes.length
      while (total > maxBytes) await drop(kept.keys().next().value!)
    },
    read: async (path) => {
      await prepared()
      const size = kept.get(path)
      if (size === undefined) return undefined
      kept.delete(path)
      kept.set(path, size)
      try {
        return new Uint8Array(await readFile(fileOf(path)))
      } catch (error) {
        // Removed from the disk under it: the durable copy is read instead.
        if (!isMissing(error)) throw error
        total -= size
        kept.delete(path)
        return undefined
      }
    },
  }
}
