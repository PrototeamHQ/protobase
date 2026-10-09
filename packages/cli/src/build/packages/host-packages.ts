import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { findPackageDir, findPackageDirSync, readPackageJson, type PackageJson } from './package-dir'

const cliRoot = fileURLToPath(new URL('../../..', import.meta.url))

// Every @protobase package the CLI runs on, found from its own package.json down, and every package they depend on,
// each with the folder of the @protobase package that declares it: the serve runtime's own copy is found from there.
const collectHostPackages = () => {
  const declaredIn = new Map<string, string>([['@protobase/cli', cliRoot]])
  const visit = (dir: string) => {
    const manifest = JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8')) as PackageJson
    for (const name of Object.keys(manifest.dependencies ?? {})) {
      if (declaredIn.has(name)) continue
      declaredIn.set(name, dir)
      if (!name.startsWith('@protobase/')) continue
      const found = findPackageDirSync(name, dir)
      if (!found) throw new Error(`${name} is not installed; reinstall @protobase/cli`)
      visit(found)
    }
  }
  visit(cliRoot)
  return declaredIn
}

const declaredIn = collectHostPackages()

// The @protobase packages and every package they depend on: a served config gets them from the serve runtime, never
// inlined, so the config and the runtime share one copy. Those the runtime does not supply (React, the CLI's) are not
// available.
export const hostPackages: ReadonlySet<string> = new Set(declaredIn.keys())

// Versions that share an API: the same major, or the same minor below 1.0.
const releaseLine = (version = '') => {
  const [major, minor] = version.split('.')
  return major === '0' ? `0.${minor}` : major
}

// Why the project's own copy of a host package cannot be swapped for the runtime's, if it cannot: the bundle would
// run against the version the @protobase packages were built with, not the one the project was written for.
export const hostVersionProblem = async (name: string, importerDir: string) => {
  const [projectDir, ownDir] = await Promise.all([findPackageDir(name, importerDir), findPackageDir(name, declaredIn.get(name) ?? cliRoot)])
  if (!projectDir || !ownDir || projectDir === ownDir) return undefined
  const [project, own] = await Promise.all([readPackageJson(projectDir), readPackageJson(ownDir)])
  if (releaseLine(project.version) === releaseLine(own.version)) return undefined
  return `${name} ${project.version} is installed here, but the serve runtime supplies ${name} ${own.version}; use a version compatible with it`
}
