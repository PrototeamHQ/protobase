import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
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

/**
 * Writes the workspace in `dir`, ignored by git, and installs its packages with npm when its package.json changed or
 * one of them is missing, as after an install that failed. `--install-links` copies a `file:` package and puts its
 * dependencies at the workspace's root, where Capacitor looks for them.
 */
export const prepareWorkspace = async (dir: string, packageJson: ReturnType<typeof workspacePackageJson>, run: (command: string, args: string[]) => Promise<void>) => {
  await mkdir(dir, { recursive: true })
  await writeFile(path.join(dir, '.gitignore'), '*\n')
  const file = path.join(dir, 'package.json')
  const content = `${JSON.stringify(packageJson, null, 2)}\n`
  const changed = !existsSync(file) || (await readFile(file, 'utf8')) !== content
  const missing = Object.keys(packageJson.dependencies).some((name) => !existsSync(path.join(dir, 'node_modules', name, 'package.json')))
  if (changed) await writeFile(file, content)
  if (changed || missing) await run('npm', ['install', '--install-links', '--no-audit', '--no-fund'])
}
