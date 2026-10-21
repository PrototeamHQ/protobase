import { mkdir, readdir, rename } from 'node:fs/promises'
import path from 'node:path'

/**
 * Moves every source map under `fromDir` to the same place under `toDir`, so a folder that is served holds no maps
 * and a copy of both folders into one puts each map back beside its script.
 */
export const moveSourceMaps = async (fromDir: string, toDir: string) => {
  const files = await readdir(fromDir, { recursive: true, withFileTypes: true })
  for (const file of files.filter((entry) => entry.isFile() && entry.name.endsWith('.map'))) {
    const from = path.join(file.parentPath, file.name)
    const to = path.join(toDir, path.relative(fromDir, from))
    await mkdir(path.dirname(to), { recursive: true })
    await rename(from, to)
  }
}
