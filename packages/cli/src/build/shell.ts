import { existsSync } from 'node:fs'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { build } from 'vite'
import type { BundleShell } from '../bundle/manifest'
import { adminAppDir, uiEntry, uiPackageDir } from '../project/admin-app'
import { projectUiPlugin } from '../project/project-ui'
import { sharedModulesPlugin } from '../project/shared-modules'
import { faviconLink } from '../project/favicon-link'
import { themeLink } from '../project/theme-link'
import { serviceWorker } from '../project/service-worker'
import { serviceWorkerFile } from './service-worker-code'
import { readPackageJson, type PackageJson } from './packages/package-dir'
import { moveSourceMaps } from './source-maps'
import { shellCodeSplitting } from './shell-chunks'

/** What a shell folder holds beside its files: the `BundleShell` a bundle's manifest copies. */
export const shellManifestFile = 'protobase.shell.json'

/** The shell's files, as URL paths: its page, its content-hashed assets and its service worker. */
export const shellPaths = ['/index.html', '/assets', `/${serviceWorkerFile}`]

/** Where @protobase/ui's package ships its prebuilt shell, which `protobase build` copies and `protobase serve` serves. */
export const prebuiltShellDir = path.join(uiPackageDir, 'dist', 'shell')

/**
 * Where @protobase/ui's package ships the prebuilt shell's source maps: beside the shell, in the same layout, rather
 * than in it, so a server of the shell serves none and `protobase build --source-maps` copies them next to the scripts.
 */
export const prebuiltShellSourceMapsDir = path.join(uiPackageDir, 'dist', 'shell-source-maps')

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
 * names, and links the project's theme at /protobase.theme.css and its favicon at /protobase.favicon.svg, and registers its service worker. The modules plugins share with it have entries of
 * their own, which index.html's import map names. With `sourceMapsDir`, each script ends with a `//# debugId=` comment
 * and names no map, and its source map, carrying the same debug id, goes to the same place under `sourceMapsDir`. The
 * scripts split into react, vendor and app chunks (./shell-chunks), so an update mostly downloads only the app's.
 */
export const buildShell = async (outDir: string, sourceMapsDir?: string) => {
  const sourceMaps = sourceMapsDir !== undefined
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
    plugins: [sharedModulesPlugin(), projectUiPlugin(undefined), themeLink(), faviconLink(), serviceWorker(), react(), tailwindcss()],
    // Web workers are builds of their own, which take the source maps from `build` but not the output's debug ids.
    worker: { rolldownOptions: { output: { sourcemapDebugIds: sourceMaps } } },
    build: { outDir, emptyOutDir: true, chunkSizeWarningLimit: 4096, sourcemap: sourceMaps && 'hidden', rolldownOptions: { output: { sourcemapDebugIds: sourceMaps, codeSplitting: shellCodeSplitting } } },
  }).finally(() => {
    if (nodeEnv === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = nodeEnv
  })
  if (sourceMapsDir !== undefined) {
    await rm(sourceMapsDir, { recursive: true, force: true })
    await moveSourceMaps(outDir, sourceMapsDir)
  }
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
 * The shell `protobase build` copies into a bundle, with its source maps' folder when `sourceMaps` asks for them: the
 * prebuilt one of the installed @protobase/ui, or, when the CLI runs from this repository's sources, one built from
 * them into the `scratch` folder, so it is never older than the code.
 */
export const shellForBuild = async (sourceMaps: boolean): Promise<{ dir: string; sourceMapsDir?: string; shell: BundleShell; scratch?: string }> => {
  if (installedShellDir) {
    if (sourceMaps && !existsSync(prebuiltShellSourceMapsDir)) throw new Error(`The installed @protobase/ui ships no source maps of its shell (${prebuiltShellSourceMapsDir}); install a version that does, or build without --source-maps`)
    return { dir: installedShellDir, ...(sourceMaps && { sourceMapsDir: prebuiltShellSourceMapsDir }), shell: await readShell(installedShellDir) }
  }
  const scratch = await mkdtemp(path.join(tmpdir(), 'protobase-shell-'))
  const dir = path.join(scratch, 'shell')
  const sourceMapsDir = sourceMaps ? path.join(scratch, 'source-maps') : undefined
  return { dir, ...(sourceMapsDir && { sourceMapsDir }), shell: await buildShell(dir, sourceMapsDir), scratch }
}
