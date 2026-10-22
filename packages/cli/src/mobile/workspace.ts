import { existsSync } from 'node:fs'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { protobaseFolder } from '../project/protobase-folder'
import { protobaseVersion } from '../version/version'

/** Where the mobile build lives in a project: npm's install of @protobase/mobile, the app's files and native projects. */
export const workspaceDir = (projectDir: string) => path.join(projectDir, protobaseFolder, 'mobile')

// From this repository's sources, the package beside the CLI's, so the repository proves it before npm has it.
const fromSource = path.extname(import.meta.url) === '.ts'

/** The @protobase/mobile to install: the CLI's own version, or this repository's package when the CLI runs from source. */
export const mobileSpec = (source = fromSource) => (source ? `file:${fileURLToPath(new URL('../../../mobile', import.meta.url))}` : protobaseVersion)

/** The workspace's package.json: @protobase/mobile and the project's extra plugins. */
export const workspacePackageJson = ({ mobileSpec, plugins = {} }: { mobileSpec: string; plugins?: Record<string, string> }) => ({
  private: true,
  dependencies: { '@protobase/mobile': mobileSpec, ...plugins },
})

// The copy of the package `name` in the workspace `dir`, which never leaves its node_modules, whatever the name.
const insideModules = (dir: string, name: string) => {
  const modules = path.join(dir, 'node_modules')
  const target = path.join(modules, name)
  const relative = path.relative(modules, target)
  if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(`mobile.plugins lists ${name}, which is not an npm package name`)
  return target
}

/**
 * Writes the workspace in `dir`, ignored by git, and installs its packages with npm when its package.json changed or
 * one of them is missing, as after an install that failed. `--install-links` copies a `file:` package and puts its
 * dependencies at the workspace's root, where Capacitor looks for them. npm keeps a `file:` copy while its spec is
 * unchanged, however its folder changed, so the copy is removed on each run and npm copies the folder again.
 */
export const prepareWorkspace = async (dir: string, packageJson: ReturnType<typeof workspacePackageJson>, run: (command: string, args: string[]) => Promise<void>) => {
  await mkdir(dir, { recursive: true })
  await writeFile(path.join(dir, '.gitignore'), '*\n')
  const file = path.join(dir, 'package.json')
  const content = `${JSON.stringify(packageJson, null, 2)}\n`
  const changed = !existsSync(file) || (await readFile(file, 'utf8')) !== content
  for (const [name, spec] of Object.entries(packageJson.dependencies)) {
    if (!spec.startsWith('file:')) continue
    await rm(insideModules(dir, name), { recursive: true, force: true })
  }
  const missing = Object.keys(packageJson.dependencies).some((name) => !existsSync(path.join(dir, 'node_modules', name, 'package.json')))
  if (changed) await writeFile(file, content)
  if (changed || missing) await run('npm', ['install', '--install-links', '--no-audit', '--no-fund'])
}
