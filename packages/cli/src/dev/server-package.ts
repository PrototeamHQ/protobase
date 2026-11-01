import { fileURLToPath } from 'node:url'
import { packageName } from '../build/packages/package-dir'
import { hostModuleIds } from '../serve/host-module-ids'
import { projectPackages } from '../version/project-packages'

const server = '@protobase/server'

// The packages the serve runtime supplies to a bundle, which a bundled project gets from the CLI in dev, as it does
// from the runtime once deployed: the @protobase packages and the main dependencies they run on.
const supplied = [...new Set(hostModuleIds.map((id) => packageName(id)!))]

// The CLI's own package folder, from src/dev in this repository and from dist/dev when installed.
const cliDir = fileURLToPath(new URL('../..', import.meta.url))

export type ServerPackage = {
  from: 'project' | 'cli'
  /** The folder Vite resolves the `dedupe` packages from, for the project's files and the CLI's alike. */
  root: string
  dedupe: string[]
}

/** The CLI's own copies of the packages the serve runtime supplies, as a bundled project gets them. */
export const cliPackages = (ownDir = cliDir): ServerPackage => ({ from: 'cli', root: ownDir, dedupe: supplied })

/**
 * Where the API of `protobase dev` gets @protobase/server: from the project's node_modules when the project is locked,
 * so one that is not installed fails as any missing package does; otherwise, bundled, the CLI's own, with the other
 * packages the serve runtime supplies.
 */
export const serverPackage = (projectDir: string, ownDir = cliDir): ServerPackage => {
  if (projectPackages(projectDir).mode === 'locked') return { from: 'project', root: projectDir, dedupe: [server] }
  return cliPackages(ownDir)
}
