import { createRequire } from 'node:module'
import path from 'node:path'
import { uiEntry } from '../project/admin-app'

// The shell's chunks split by how often they change, so a Protobase update downloads mostly the app's own code: React
// in `react`, which changes only with React; the other third-party modules the shell loads at start in `vendor`; and
// the rest, Protobase itself, in `app`. Third-party modules only lazy code loads, such as the map's, go in a `lib-` chunk
// per package, so a lazy chunk large enough to matter holds no first-party code and changes only with its package. The
// workflow engine's modules, which the workflow editor and step catalog load, go in `workflows`: they import only each
// other and libraries, so that chunk changes only with the engine, and the editor's own chunks stay small. The few the
// start loads, such as the workflow field's reading of a definition, go in `workflows-start`, so they bring none of the
// libraries the rest import with them.

/**
 * The npm package a module id belongs to, as the last `node_modules` segment of its path names it, since Bun's store
 * nests packages as `node_modules/.bun/<package>@<version>/node_modules/<package>`; none for a module outside one.
 */
export const npmPackage = (id: string) => /.*node_modules[\\/]((?:@[^\\/]+[\\/])?[^\\/]+)/.exec(id)?.[1]?.replace('\\', '/')

const reactPackages = new Set(['react', 'react-dom', 'scheduler'])

/** Whether a module goes in the `react` chunk. */
export const isReactModule = (id: string) => reactPackages.has(npmPackage(id) ?? '')

/**
 * Whether a module goes in the `vendor` chunk: a third-party one but React's and the icons'. The icons stay in `app`,
 * since the app picks up a new one on many releases, which would change `vendor` and every lazy chunk that imports it.
 */
export const isVendorModule = (id: string) => {
  const name = npmPackage(id)
  return name !== undefined && !reactPackages.has(name) && name !== 'lucide-react'
}

// Vite's helper for lazy imports: third-party code the start loads, which rolldown would otherwise put in whichever
// chunk first imports something lazily, such as a lazy library's.
const preloadHelper = '\0vite/preload-helper.js'

// The folder of @protobase/workflows as @protobase/ui resolves it, symlinks resolved: packages/workflows in this
// repository, where the shell is built from.
const workflowsDir = path.resolve(path.dirname(createRequire(uiEntry).resolve('@protobase/workflows')), '..')

// A path with forward slashes, as Vite gives module ids on every platform.
const slashed = (file: string) => file.replaceAll('\\', '/')

/** Whether a module is one of the workflow engine's, which go in the `workflows` chunk: inside its folder, not beside it. */
export const isWorkflowsModule = (id: string, dir = workflowsDir) => slashed(id).startsWith(`${slashed(dir).replace(/\/$/, '')}/`)

/** The chunk name of a third-party module only lazy code loads: its package's, such as `lib-xyflow-react`. */
export const libChunkName = (id: string) => `lib-${npmPackage(id)!.replace('@', '').replace('/', '-')}`

/**
 * The shell build's `output.codeSplitting`. `react` comes first: without it, `vendor` would take React in as a
 * dependency of the libraries it holds, and lazy chunks would import it from there.
 */
export const shellCodeSplitting = {
  groups: [
    { name: 'react', test: isReactModule, priority: 2 },
    { name: 'vendor', test: (id: string) => isVendorModule(id) || id === preloadHelper, tags: ['$initial' as const], priority: 1 },
    { name: libChunkName, debugName: 'lib', test: isVendorModule },
    { name: 'workflows-start', test: (id: string) => isWorkflowsModule(id), tags: ['$initial' as const], priority: 1 },
    { name: 'workflows', test: (id: string) => isWorkflowsModule(id) },
  ],
}
