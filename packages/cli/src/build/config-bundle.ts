import path from 'node:path'
import type { Plugin } from 'vite'
import { hostModuleIds } from '../serve/host-module-ids'
import { bundleEntryCode } from './entry-code'
import { layoutCheck } from './layout-check'
import { hostPackages, hostVersionProblem } from './packages/host-packages'
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
// it supplies stay imports, the rest is not available. A package with a native add-on is loaded from disk, so it stays
// an import too and is collected in `native` for the bundle to carry. Everything else is inlined.
const servedImports = (native: Map<string, NativeImport>): Plugin => {
  const checked = new Map<string, Promise<boolean>>()
  const isNative = (dir: string) => {
    if (!checked.has(dir)) checked.set(dir, isNativePackage(dir))
    return checked.get(dir)!
  }
  return {
    name: 'protobase-served-imports',
    enforce: 'pre',
    async resolveId(id, importer) {
      const name = packageName(id)
      if (name === undefined || importer === undefined) return undefined
      const from = importerDir(importer)
      if (hostPackages.has(name)) {
        if (!isHostModule(id)) this.error(`${id} is not available to a served config; of the @protobase packages and their dependencies it may import ${hostModuleIds.join(', ')}`)
        const problem = await hostVersionProblem(name, from)
        if (problem) this.error(problem)
        return { id, external: true }
      }
      const dir = await findPackageDir(name, from)
      if (dir === undefined || !(await isNative(dir))) return undefined
      const other = native.get(name)
      if (other && other.dir !== dir) this.error(`The config imports two installs of ${name}, a native package: ${other.dir} and ${dir}`)
      native.set(name, { name, dir })
      return { id, external: true }
    },
  }
}

export type ConfigBundleInput = { projectDir: string; outFile: string }

// The project's config as one module whose default export is a ProjectConfig with `config` always set. Returns the
// packages with native add-ons it imports, which the bundle has to carry (see copyPackages).
export const buildConfigBundle = async ({ projectDir, outFile }: ConfigBundleInput): Promise<NativeImport[]> => {
  const file = path.join(projectDir, 'protobase-bundle-entry.js')
  const native = new Map<string, NativeImport>()
  await viteBundle({ root: projectDir, entry: file, outFile, plugins: [layoutCheck(), servedImports(native), entry(file, bundleEntryCode(projectDir))] })
  return [...native.values()]
}
