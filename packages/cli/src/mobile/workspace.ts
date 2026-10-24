import { existsSync } from 'node:fs'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { protobaseFolder } from '../project/protobase-folder'
import { appPluginsCommand, appPluginsHooks } from './app-plugins-hook'
import { protobaseVersion } from '../version/version'
import { checkLocalPins, isUnmet, localPins } from './local-pins'
import { isLocalSpec } from './local-spec'
import { packageNameProblem } from './package-name'

/** Where the mobile build lives in a project: npm's install of @protobase/mobile, the app's files and native projects. */
export const workspaceDir = (projectDir: string) => path.join(projectDir, protobaseFolder, 'mobile')

// From this repository's sources, the package beside the CLI's, so the repository proves it before npm has it.
const fromSource = path.extname(import.meta.url) === '.ts'

/** The @protobase/mobile to install: the CLI's own version, or this repository's package when the CLI runs from source. */
export const mobileSpec = (source = fromSource) => (source ? `file:${fileURLToPath(new URL('../../../mobile', import.meta.url))}` : protobaseVersion)

/** The workspace's package.json: @protobase/mobile, the project's extra plugins and the hooks that keep the app's UI plugins. */
export const workspacePackageJson = ({ mobileSpec, plugins = {} }: { mobileSpec: string; plugins?: Record<string, string> }) => ({
  private: true,
  scripts: Object.fromEntries(appPluginsHooks.map((hook) => [hook, appPluginsCommand])),
  dependencies: { '@protobase/mobile': mobileSpec, ...plugins },
})

// The copy of the package `name` in the workspace `dir`, which never leaves its node_modules, whatever the name.
const insideModules = (dir: string, name: string) => {
  const problem = packageNameProblem(name)
  if (problem) throw new Error(problem)
  return path.join(dir, 'node_modules', name)
}

/**
 * Writes the workspace in `dir`, ignored by git, and installs its packages with npm when its package.json changed or
 * one of them is missing, as after an install that failed. `--install-links` copies a local folder, `file:` or a bare
 * path, and puts its dependencies at the workspace's root, where Capacitor looks for them. npm keeps that copy while
 * its spec is unchanged, however the folder changed, so the copy is removed on each run and npm copies it again. npm
 * also keeps the root's versions its lock names, so when a folder's pins are not what the root holds, node_modules
 * and the lock are removed and npm resolves the whole tree again.
 */
export const prepareWorkspace = async (dir: string, packageJson: ReturnType<typeof workspacePackageJson>, run: (command: string, args: string[]) => Promise<void>) => {
  const local = Object.entries(packageJson.dependencies).filter(([, spec]) => isLocalSpec(spec))
  const copies = local.map(([name]) => insideModules(dir, name))
  await mkdir(dir, { recursive: true })
  await writeFile(path.join(dir, '.gitignore'), '*\n')
  const file = path.join(dir, 'package.json')
  const content = `${JSON.stringify(packageJson, null, 2)}\n`
  const changed = !existsSync(file) || (await readFile(file, 'utf8')) !== content
  if (localPins(dir, packageJson.dependencies).some(isUnmet)) {
    await rm(path.join(dir, 'node_modules'), { recursive: true, force: true })
    await rm(path.join(dir, 'package-lock.json'), { force: true })
  }
  for (const copy of copies) await rm(copy, { recursive: true, force: true })
  const missing = Object.keys(packageJson.dependencies).some((name) => !existsSync(path.join(dir, 'node_modules', name, 'package.json')))
  if (changed) await writeFile(file, content)
  if (changed || missing) await run('npm', ['install', '--install-links', '--no-audit', '--no-fund'])
  checkLocalPins(localPins(dir, packageJson.dependencies))
}
