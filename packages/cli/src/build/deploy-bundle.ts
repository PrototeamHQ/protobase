import { existsSync } from 'node:fs'
import { cp, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { bundleLayout, bundleNodeModules, manifestFile, type BundleManifest } from '../bundle/manifest'
import { buildBundlePlugins } from './bundle-plugins'
import { buildConfigBundle } from './config-bundle'
import { protobaseVersion } from '../version/version'
import { copyPackages } from './packages/copy-packages'
import { shellForBuild, shellManifestFile } from './shell'
import { buildTheme } from './theme'
import { buildIcons } from './app-icons'
import { checkUi } from './ui-check'
import { checkViews } from './view-check'
import type { Extension } from '../project/extensions'
import { protobaseFolder } from '../project/protobase-folder'

export type DeployBundleInput = {
  projectDir: string
  outDir: string
  bun?: boolean
  extensions?: Extension[]
  /** Hears what the build does not fail on but the developer should know, such as a token the theme misspells. */
  onWarning?: (message: string) => void
}

// node_modules in the output folder is replaced only when the previous build's manifest names it as its own, so a
// build into the project folder itself never deletes the project's packages.
const removeOwnNodeModules = async (outDir: string) => {
  const dir = path.join(outDir, bundleNodeModules)
  if (!existsSync(dir)) return
  const manifest = path.join(outDir, manifestFile)
  const previous = existsSync(manifest) ? (JSON.parse(await readFile(manifest, 'utf8')) as { nodeModules?: unknown }) : undefined
  if (previous?.nodeModules !== bundleNodeModules) throw new Error(`${dir} was not written by \`protobase build\`; build into another folder (--out)`)
  await rm(dir, { recursive: true, force: true })
}

// The prebuilt shell's files, without the file naming its version, which the manifest carries instead.
const copyShell = async (publicDir: string) => {
  const { dir, shell, scratch } = await shellForBuild()
  try {
    await rm(publicDir, { recursive: true, force: true })
    await cp(dir, publicDir, { recursive: true, filter: (file) => path.basename(file) !== shellManifestFile })
  } finally {
    if (scratch) await rm(dir, { recursive: true, force: true })
  }
  return shell
}

// The folder a host deploys: the config module for the serve runtime with the packages it loads from disk; under
// public/ the prebuilt app (the shell), the project's protobase.ui.tsx and extensions' UI configs as plugins, its
// theme, checked and minified, and its icons; and the manifest saying which paths go to the server, which Protobase
// version built it, its plugins, theme and shell, and which icons are the project's own. Of the project's server config
// only the config folder runs at build time, to check its views against its resources; when it declares custom
// components, or extensions have UI configs, the UI is loaded once to check its names against the config's and each
// other's.
export const buildDeployBundle = async ({ projectDir, outDir, bun, extensions = [], onWarning }: DeployBundleInput): Promise<BundleManifest> => {
  await removeOwnNodeModules(outDir)
  const components = new Set<string>()
  const native = await buildConfigBundle({ projectDir, outFile: path.join(outDir, bundleLayout.server), bun, extensions, components })
  await checkViews(projectDir)
  await checkUi(projectDir, extensions, components)
  const packages = native.length > 0 ? await copyPackages(native, path.join(outDir, bundleNodeModules)) : []
  const publicDir = path.join(outDir, bundleLayout.public)
  const shell = await copyShell(publicDir)
  // What Protobase generates in the project, such as the mobile workspace's packages and native projects, is no source of styles.
  const plugins = await buildBundlePlugins({ projectDir, publicDir, extensions, ignore: [outDir, path.join(projectDir, protobaseFolder)] })
  for (const warning of await buildTheme({ projectDir, outFile: path.join(publicDir, bundleLayout.theme) })) onWarning?.(warning)
  const icons = await buildIcons({ projectDir, publicDir })
  const manifest: BundleManifest = {
    version: 3,
    protobase: protobaseVersion,
    ...bundleLayout,
    api: [...bundleLayout.api],
    plugins,
    shell,
    icons,
    ...(packages.length > 0 ? { nodeModules: bundleNodeModules } : {}),
  }
  await writeFile(path.join(outDir, manifestFile), `${JSON.stringify(manifest, null, 2)}\n`)
  return manifest
}
