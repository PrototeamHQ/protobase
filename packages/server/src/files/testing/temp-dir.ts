import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

/** A fresh folder under the system's temp folder, and a way to remove it. */
export const tempDir = async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'protobase-files-'))
  return { dir, remove: () => rm(dir, { recursive: true, force: true }) }
}
