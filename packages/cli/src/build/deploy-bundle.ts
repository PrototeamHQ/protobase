import { existsSync } from 'node:fs'
import { cp, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { bundleLayout, bundleMigrations, bundleNodeModules, manifestFile, type BundleManifest } from '../bundle/manifest'
import { buildBundlePlugins } from './bundle-plugins'
import { copyMigrations } from './bundle-migrations'
import { buildConfigBundle } from './config-bundle'
import { bundleProtobaseVersion } from '../version/project-version'
import { copyPackages } from './packages/copy-packages'
import { shellForBuild, shellManifestFile } from './shell'
import { buildTheme } from './theme'
import { buildIcons } from './app-icons'
import { checkUi } from './ui-check'
import { checkViews } from './view-check'
import type { Extension } from '../project/extensions'
import { protobaseFolder } from '../project/protobase-folder'
import { pinnedNative } from '../mobile/pinned-packages'

export type DeployBundleInput = {
  projectDir: string
  outDir: string
  bun?: boolean
  extensions?: Extension[]
  /** Writes each script of the shell and the plugins with a `//# debugId=` comment and its source map beside it. */
  sourceMaps?: boolean
  /** Hears what the build does not fail on but the developer should know, such as a token the theme misspells. */
  onWarning?: (message: string) => void
}

// A folder of the output that a build writes, such as node_modules, is replaced only when the previous build's
// manifest names it as its own under `key`, so a build into the project folder itself never deletes the project's.
const removeOwnFolder = async (outDir: string, name: string, key: 'nodeModules' | 'migrations') => {
  const dir = path.join(outDir, name)
  if (!existsSync(dir)) return
  const manifest = path.join(outDir, manifestFile)
  const previous = existsSync(manifest) ? (JSON.parse(await readFile(manifest, 'utf8')) as Record<string, unknown>) : undefined
  if (previous?.[key] !== name) throw new Error(`${dir} was not written by \`protobase build\`; build into another folder (--out)`)
  await rm(dir, { recursive: true, force: true })
}

// The prebuilt shell's files, without the file naming its version, which the manifest carries instead, and its source
// maps beside its scripts when asked for.
const copyShell = async (publicDir: string, sourceMaps: boolean) => {
  const { dir, sourceMapsDir, shell, scratch } = await shellForBuild(sourceMaps)
  try {
    await rm(publicDir, { recursive: true, force: true })
    await cp(dir, publicDir, { recursive: true, filter: (file) => path.basename(file) !== shellManifestFile })
    if (sourceMapsDir) await cp(sourceMapsDir, publicDir, { recursive: true })
  } finally {
    if (scratch) await rm(scratch, { recursive: true, force: true })
  }
  return shell
}

// The folder a host deploys: the config module for the serve runtime with the packages it loads from disk; under
// public/ the prebuilt app (the shell), the project's protobase.ui.tsx and extensions' UI configs as plugins, its
// theme, checked and minified, and its icons; the project's db/migrations as migrations/; and the manifest saying which
// paths go to the server, which Protobase version the bundle runs on, its plugins, theme, shell and migrations,
// which icons are the project's own, and the native packages the shell runs on in the mobile app. Of the project's server config
// only the config folder runs at build time, to check its views against its resources; when it declares custom
// components, or extensions have UI configs, the UI is loaded once to check its names against the config's and each
// other's.
export const buildDeployBundle = async ({ projectDir, outDir, bun, extensions = [], sourceMaps = false, onWarning }: DeployBundleInput): Promise<BundleManifest> => {
  const protobase = bundleProtobaseVersion(projectDir)
  await removeOwnFolder(outDir, bundleNodeModules, 'nodeModules')
  await removeOwnFolder(outDir, bundleMigrations, 'migrations')
  const components = new Set<string>()
  const native = await buildConfigBundle({ projectDir, outFile: path.join(outDir, bundleLayout.server), bun, extensions, components })
  await checkViews(projectDir)
  await checkUi(projectDir, extensions, components)
  const packages = native.length > 0 ? await copyPackages(native, path.join(outDir, bundleNodeModules)) : []
  const publicDir = path.join(outDir, bundleLayout.public)
  const shell = await copyShell(publicDir, sourceMaps)
  const migrations = await copyMigrations({ projectDir, outDir })
  // What Protobase generates in the project, such as the mobile workspace's packages and native projects, is no source of styles.
  const plugins = await buildBundlePlugins({ projectDir, publicDir, extensions, ignore: [outDir, path.join(projectDir, protobaseFolder)], sourceMaps })
  for (const warning of await buildTheme({ projectDir, outFile: path.join(publicDir, bundleLayout.theme) })) onWarning?.(warning)
  const icons = await buildIcons({ projectDir, publicDir })
  const manifest: BundleManifest = {
    version: 3,
    protobase,
    ...bundleLayout,
    api: [...bundleLayout.api],
    plugins,
    shell,
    icons,
    native: pinnedNative,
    ...(packages.length > 0 ? { nodeModules: bundleNodeModules } : {}),
    ...(migrations ? { migrations } : {}),
  }
  await writeFile(path.join(outDir, manifestFile), `${JSON.stringify(manifest, null, 2)}\n`)
  return manifest
}
