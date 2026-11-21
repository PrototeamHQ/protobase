import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

export const relayPackage = '@protobase/realtime'

// The CLI's own package folder, from src/dev in this repository and from dist/dev when installed.
const cliDir = fileURLToPath(new URL('../..', import.meta.url))

// The package's entry as Node resolves it from `dir`; undefined when it is not installed there.
const resolveFrom = (dir: string) => {
  try {
    return createRequire(path.join(dir, 'package.json')).resolve(relayPackage)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'MODULE_NOT_FOUND') return
    throw error
  }
}

/** The entry of the relay's npm package: the project's own install first, then the CLI's. */
export const relayPackageEntry = (projectDir: string, ownDir = cliDir) => {
  const entry = resolveFrom(projectDir) ?? resolveFrom(ownDir)
  if (!entry) throw new Error(`realtime.relay has no url, so protobase dev runs a relay of its own from ${relayPackage}, which is not installed: add it to the project's devDependencies, or set realtime.relay.url to a running relay`)
  return entry
}

/** The path of the relay binary for this machine, as the package's `binaryPath()` finds it. */
export const relayBinary = async (projectDir: string, ownDir = cliDir) => {
  const { binaryPath } = (await import(/* @vite-ignore */ pathToFileURL(relayPackageEntry(projectDir, ownDir)).href)) as { binaryPath: () => string }
  return binaryPath()
}
