import path from 'node:path'
import type { Plugin } from 'vite'
import { loadSourceConfig } from '../config/source-config'
import { hostModuleIds } from '../serve/host-module-ids'
import { extensionImports, type Extension } from '../project/extensions'
import { collectComponents } from './component-names'
import { bundleEntryCode } from './entry-code'
import { layoutCheck } from './layout-check'
import { hostPackages } from './packages/host-packages'
import { isNativePackage } from './packages/native-package'
import { findPackageDir, packageName } from './packages/package-dir'
import type { NativeImport } from './packages/package-tree'
import { viteBundle } from './vite-bundle'

const isHostModule = (id: string): boolean => (hostModuleIds as readonly string[]).includes(id)

// A generated module standing in for a file in the project, so its imports resolve from there.
const entry = (file: string, code: string): Plugin => ({
  name: 'protobase-config-entry',
  resolveId: (id) => (id === file ? `\0${file}` : undefined),
  load: (id) => (id === `\0${file}` ? code : undefined),
})

// The folder an importing module resolves from; the entry's id carries the `\0` of a virtual module.
const importerDir = (importer: string) => path.dirname(importer.replace(/^\0/, '').replace(/\?.*$/, ''))

// Imports that stay imports. The @protobase packages and their dependencies are the serve runtime's to supply: those
// it supplies stay imports, the rest is not available. Such an import fails the build only when the finished bundle
// still has it, so an inlined package may re-export a module that imports one, as `react-email` does `tailwindcss`, as
// long as the project leaves that export unused and it is dropped. A package with a native add-on is loaded from disk,
// so it stays an import too and is collected in `native` for the bundle to carry. Everything else is inlined.
const servedImports = (native: Map<string, NativeImport>): Plugin => {
  const checked = new Map<string, Promise<boolean>>()
  const isNative = (dir: string) => {
    if (!checked.has(dir)) checked.set(dir, isNativePackage(dir))
    return checked.get(dir)!
  }
  const unavailable = new Set<string>()
  return {
    name: 'protobase-served-imports',
    enforce: 'pre',
    async resolveId(id, importer) {
      const name = packageName(id)
      if (name === undefined || importer === undefined) return undefined
      const from = importerDir(importer)
      if (hostPackages.has(name)) {
        if (!isHostModule(id)) {
          unavailable.add(id)
          return { id, external: true }
        }
        return { id, external: true }
      }
      const dir = await findPackageDir(name, from)
      if (dir === undefined || !(await isNative(dir))) return undefined
      const other = native.get(name)
      if (other && other.dir !== dir) this.error(`The config imports two installs of ${name}, a native package: ${other.dir} and ${dir}`)
      native.set(name, { name, dir })
      return { id, external: true }
    },
    generateBundle(_, bundle) {
      for (const output of Object.values(bundle)) {
        if (output.type !== 'chunk') continue
        const id = output.imports.find((imported) => unavailable.has(imported))
        if (id) this.error(`${id} is not available to a served config; of the @protobase packages and their dependencies it may import ${hostModuleIds.join(', ')}`)
      }
    },
  }
}

export type ConfigBundleInput = {
  projectDir: string
  outFile: string
  bun?: boolean
  extensions?: Extension[]
  /** Collects the custom components the config declares with `component('Name')`. */
  components?: Set<string>
}

// The project's config and the extensions' configs, with the code their conventions find, as one module (see
// `bundleEntryCode`). Each config is read first, so one that breaks the rules stops the build. Returns the packages with native add-ons it imports, which the bundle has to carry (see
// copyPackages).
export const buildConfigBundle = async ({ projectDir, outFile, bun, extensions = [], components = new Set() }: ConfigBundleInput): Promise<NativeImport[]> => {
  const config = await loadSourceConfig(projectDir, { command: 'build', extensions })
  const file = path.join(projectDir, 'protobase-bundle-entry.js')
  const native = new Map<string, NativeImport>()
  const plugins = [layoutCheck(), collectComponents(components), extensionImports(projectDir, extensions), servedImports(native), entry(file, bundleEntryCode(projectDir, extensions, config.files?.images ? [config.files.images] : []))]
  await viteBundle({ root: projectDir, entry: file, outFile, bun, plugins })
  return [...native.values()]
}
