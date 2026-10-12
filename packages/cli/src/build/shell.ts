import { existsSync } from 'node:fs'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { build } from 'vite'
import type { BundleShell } from '../bundle/manifest'
import { adminAppDir, uiEntry, uiPackageDir } from '../project/admin-app'
import { projectUiPlugin } from '../project/project-ui'
import { sharedModulesPlugin } from '../project/shared-modules'
import { readPackageJson, type PackageJson } from './packages/package-dir'

/** What a shell folder holds beside its files: the `BundleShell` a bundle's manifest copies. */
export const shellManifestFile = 'protobase.shell.json'

/** The shell's files, as URL paths: its page and its content-hashed assets. */
export const shellPaths = ['/index.html', '/assets']

/** Where @protobase/ui's package ships its prebuilt shell, which `protobase build` copies and `protobase serve` serves. */
export const prebuiltShellDir = path.join(uiPackageDir, 'dist', 'shell')

type UiPackageJson = PackageJson & { protobase?: { pluginApi?: number } }

// The Protobase version and plugin API of the @protobase/ui the CLI builds the shell from.
const shellIdentity = async (): Promise<BundleShell> => {
  const ui = (await readPackageJson(uiPackageDir)) as UiPackageJson
  if (!ui.version || ui.protobase?.pluginApi === undefined) throw new Error(`${uiPackageDir} names no version or plugin API`)
  return { protobase: ui.version, pluginApi: ui.protobase.pluginApi, paths: shellPaths }
}

/**
 * The admin app as a production build, the same for every project: index.html and content-hashed files under assets/,
 * with protobase.shell.json saying which version it is. Asset URLs are absolute, so index.html works as the answer to
 * any deep link. It calls /api on its own origin and loads the project's UI, like every plugin, from what `/meta`
 * names. The modules plugins share with it have entries of their own, which index.html's import map names.
 */
export const buildShell = async (outDir: string) => {
  // Vite builds for a NODE_ENV that is already set (vitest sets `test`, a .env may set `development`), and React then
  // ships its development build; the shell is always a production build.
  const nodeEnv = process.env.NODE_ENV
  process.env.NODE_ENV = 'production'
  await build({
    configFile: false,
    root: adminAppDir,
    base: '/',
    mode: 'production',
    publicDir: false,
    logLevel: 'warn',
    plugins: [sharedModulesPlugin(), projectUiPlugin(undefined), react(), tailwindcss()],
    build: { outDir, emptyOutDir: true, chunkSizeWarningLimit: 4096 },
  }).finally(() => {
    if (nodeEnv === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = nodeEnv
  })
  const shell = await shellIdentity()
  await writeFile(path.join(outDir, shellManifestFile), `${JSON.stringify(shell, null, 2)}\n`)
  return shell
}

/** The shell in `dir`, as its protobase.shell.json describes it. */
export const readShell = async (dir: string): Promise<BundleShell> => {
  const file = path.join(dir, shellManifestFile)
  if (!existsSync(file)) throw new Error(`${dir} holds no shell: it has no ${shellManifestFile}`)
  return JSON.parse(await readFile(file, 'utf8')) as BundleShell
}

/** The shell `protobase serve` has of its own: the installed @protobase/ui's, none when the CLI runs from sources. */
export const installedShellDir = path.extname(uiEntry) === '.js' ? prebuiltShellDir : undefined

/**
 * The shell `protobase build` copies into a bundle: the prebuilt one of the installed @protobase/ui, or, when the CLI
 * runs from this repository's sources, one built from them into a scratch folder, so it is never older than the code.
 */
export const shellForBuild = async () => {
  if (installedShellDir) return { dir: installedShellDir, shell: await readShell(installedShellDir) }
  const dir = await mkdtemp(path.join(tmpdir(), 'protobase-shell-'))
  return { dir, shell: await buildShell(dir), scratch: true }
}
