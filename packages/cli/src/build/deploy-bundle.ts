import { existsSync } from 'node:fs'
import { readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { bundleLayout, bundleNodeModules, manifestFile, type BundleManifest } from '../bundle/manifest'
import { buildConfigBundle } from './config-bundle'
import { protobaseVersion } from '../version/version'
import { copyPackages } from './packages/copy-packages'
import { buildUiBundle } from './ui-bundle'
import { checkUi } from './ui-check'
import type { Extension } from '../project/extensions'

export type DeployBundleInput = { projectDir: string; outDir: string; bun?: boolean; extensions?: Extension[] }

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

// The folder a host deploys: the config module for the serve runtime with the packages it loads from disk, the admin
// UI under public/ and the manifest saying which paths go to the server and which Protobase version built it. Nothing of
// the project's server config runs at build time; when it declares custom components, or extensions have UI configs,
// the UI is loaded once to check its names against the config's and each other's.
export const buildDeployBundle = async ({ projectDir, outDir, bun, extensions = [] }: DeployBundleInput): Promise<BundleManifest> => {
  await removeOwnNodeModules(outDir)
  const components = new Set<string>()
  const native = await buildConfigBundle({ projectDir, outFile: path.join(outDir, bundleLayout.server), bun, extensions, components })
  await checkUi(projectDir, extensions, components)
  const packages = native.length > 0 ? await copyPackages(native, path.join(outDir, bundleNodeModules)) : []
  await buildUiBundle({ outDir: path.join(outDir, bundleLayout.public), projectDir, extensions })
  const manifest: BundleManifest = { version: 2, protobase: protobaseVersion, ...bundleLayout, api: [...bundleLayout.api], ...(packages.length > 0 ? { nodeModules: bundleNodeModules } : {}) }
  await writeFile(path.join(outDir, manifestFile), `${JSON.stringify(manifest, null, 2)}\n`)
  return manifest
}
