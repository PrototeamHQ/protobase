import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { findPackageDirSync, type PackageJson } from './package-dir'

const cliRoot = fileURLToPath(new URL('../../..', import.meta.url))

// Packages a @protobase package depends on but loads only when it needs them, so the serve runtime does not supply
// them: a served config inlines its own copy, as of any other package. React Email's components, which the auth emails
// load when one is sent, are one; a project's own email templates bring theirs.
const loadedOnDemand = new Set(['react-email'])

// Every @protobase package the CLI runs on, found from its own package.json down, and every package they depend on,
// each with the folder of the @protobase package that declares it: the serve runtime's own copy is found from there.
const collectHostPackages = () => {
  const declaredIn = new Map<string, string>([['@protobase/cli', cliRoot]])
  const visit = (dir: string) => {
    const manifest = JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8')) as PackageJson
    for (const name of Object.keys(manifest.dependencies ?? {})) {
      if (declaredIn.has(name) || loadedOnDemand.has(name)) continue
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

