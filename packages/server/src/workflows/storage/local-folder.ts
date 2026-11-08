import { StepError } from '@protobase/workflows'
import { isStoredPath } from './stored-path'

const node = async () => ({ fs: await import('node:fs/promises'), path: await import('node:path') })

const codeOf = (error: unknown) => (error instanceof Error ? (error as { code?: unknown }).code : undefined)

// The real path of `target`, through its nearest folder that exists, so a symlink anywhere above it is followed.
const realPath = async (target: string): Promise<string> => {
  const { fs, path } = await node()
  try {
    return await fs.realpath(target)
  } catch (error) {
    if (codeOf(error) !== 'ENOENT') throw error
    const parent = path.dirname(target)
    if (parent === target) throw error
    return path.join(await realPath(parent), path.basename(target))
  }
}

const within = (inner: string, outer: string, sep: string) => inner === outer || inner.startsWith(outer.endsWith(sep) ? outer : `${outer}${sep}`)

/**
 * The real folder a local configuration's `dir` names inside the storage `root`, created when missing. Both the root
 * and the file providers' folders are taken as real paths, so a symlink cannot lead the root into a provider's files
 * (the run files and traces of the private one) nor `dir` out of the root; either refuses the step.
 */
export const localFolder = async (root: string, dir: unknown, providerDirs: readonly string[]) => {
  const { fs, path } = await node()
  if (!isStoredPath(dir)) throw new StepError('Storage.NotFound', 'The storage configuration has a folder outside the storage root')
  await fs.mkdir(root, { recursive: true })
  const realRoot = await realPath(path.resolve(root))
  for (const provider of providerDirs) {
    const realProvider = await realPath(path.resolve(provider))
    if (within(realRoot, realProvider, path.sep) || within(realProvider, realRoot, path.sep)) {
      throw new Error('workflows.storage.root overlaps the folder of a file provider; give it a folder of its own')
    }
  }
  const inside = (real: string) => real !== realRoot && within(real, realRoot, path.sep)
  const outside = () => new StepError('Storage.NotFound', 'The storage configuration has a folder outside the storage root')
  const target = path.join(realRoot, dir)
  // Checked before the folder is made, so nothing is created outside the root, and again on the folder made.
  if (!inside(await realPath(target))) throw outside()
  await fs.mkdir(target, { recursive: true })
  const made = await fs.realpath(target)
  if (!inside(made)) throw outside()
  return made
}
