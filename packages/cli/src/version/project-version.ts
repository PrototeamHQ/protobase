import { readFileSync } from 'node:fs'
import path from 'node:path'
import semver from 'semver'
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

/**
 * Refuses a project whose Protobase version this CLI is not compatible with, the one version check the CLI makes: the
 * CLI's version must be in the caret range of the project's, so from 1.0 on the same major and below 1.0, where a minor
 * may break, the same minor, and never older. Outside a project, or before its install, there is nothing to check.
 */
export const checkProjectVersion = (projectDir: string, cliVersion = protobaseVersion) => {
  const project = projectProtobaseVersion(projectDir)
  if (project === undefined) return
  const range = `^${project}`
  if (semver.satisfies(cliVersion, range)) return
  throw new Error(`This project is on Protobase ${project}, and this CLI is Protobase ${cliVersion}: run it with a Protobase ${range} CLI`)
}
