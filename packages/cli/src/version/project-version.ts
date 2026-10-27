import { readFileSync } from 'node:fs'
import path from 'node:path'
import semver from 'semver'
import { findPackageDirSync } from '../build/packages/package-dir'
import { projectPackages } from './project-packages'
import { protobaseVersion } from './version'

// Packages every project installs, all released at the same version; the first found names the project's.
const installedPackages = ['@protobase/cli', '@protobase/server', '@protobase/ui']

/**
 * The Protobase version installed for the project in `projectDir`: the version its lockfile installed, read from the
 * @protobase package Node's resolution finds from there. Undefined outside a project, or before its install.
 */
export const projectProtobaseVersion = (projectDir: string): string | undefined => {
  for (const name of installedPackages) {
    const dir = findPackageDirSync(name, projectDir)
    if (dir) return (JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8')) as { version: string }).version
  }
  return undefined
}

// The installed copies must be ones this CLI can run: the CLI's version in the caret range of theirs, so from 1.0 on
// the same major and below 1.0, where a minor may break, the same minor, and never older.
const checkInstalled = (projectDir: string, cliVersion: string) => {
  const installed = projectProtobaseVersion(projectDir)
  if (installed === undefined) return
  const range = `^${installed}`
  if (semver.satisfies(cliVersion, range)) return
  throw new Error(`This project has Protobase ${installed} installed, and this CLI is Protobase ${cliVersion}: run it with a Protobase ${range} CLI`)
}

/**
 * Refuses a project whose Protobase version this CLI does not satisfy, the one version check the CLI makes: the
 * specifier its package.json lists the @protobase packages at must hold the CLI's version, by semver, and in a locked
 * project, whose installed copies run, those must be ones the CLI runs. A specifier that is no semver range, such as
 * `workspace:*`, says no version, so the installed copies are checked instead. Outside a project, or one that lists no
 * @protobase package, there is nothing to check.
 */
export const checkProjectVersion = (projectDir: string, cliVersion = protobaseVersion) => {
  const { mode, specifier } = projectPackages(projectDir)
  if (specifier === undefined) return
  const range = semver.validRange(specifier) !== null
  if (range && !semver.satisfies(cliVersion, specifier)) {
    throw new Error(`This project asks for Protobase ${specifier}, and this CLI is Protobase ${cliVersion}: run it with a CLI whose version ${specifier} holds`)
  }
  if (mode === 'locked' || !range) checkInstalled(projectDir, cliVersion)
}
