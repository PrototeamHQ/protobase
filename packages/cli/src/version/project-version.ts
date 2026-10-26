import { readFileSync } from 'node:fs'
import path from 'node:path'
import { findPackageDirSync } from '../build/packages/package-dir'
import { protobaseVersion } from './version'

// Packages every project installs, all released at the same version; the first found names the project's.
const projectPackages = ['@protobase/cli', '@protobase/server', '@protobase/ui']

/**
 * The Protobase version the project in `projectDir` is pinned to: the version its lockfile installed, read from the
 * @protobase package Node's resolution finds from there. Undefined outside a project, or before its install.
 */
export const projectProtobaseVersion = (projectDir: string): string | undefined => {
  for (const name of projectPackages) {
    const dir = findPackageDirSync(name, projectDir)
    if (dir) return (JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8')) as { version: string }).version
  }
  return undefined
}

const major = (version: string) => version.split('.')[0]

/**
 * Refuses a project of another Protobase major than this CLI's, the one version check the CLI makes: within a major a
 * CLI runs every project, whatever its minor. Outside a project, or before its install, there is nothing to check.
 */
export const checkProjectMajor = (projectDir: string, cliVersion = protobaseVersion) => {
  const project = projectProtobaseVersion(projectDir)
  if (project === undefined || major(project) === major(cliVersion)) return
  throw new Error(`This project is on Protobase ${project}, and this CLI is Protobase ${cliVersion}: run it with a Protobase ${major(project)}.x CLI`)
}
