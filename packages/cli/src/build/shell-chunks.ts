// The shell's chunks split by how often they change, so a Protobase update downloads mostly the app's own code: React
// in `react`, which changes only with React; the other third-party modules the shell loads at start in `vendor`; and
// the rest, Protobase itself, in `app`. Lazy dependencies, such as the map's, stay in their lazy chunks.

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

/**
 * The shell build's `output.codeSplitting`. `react` comes first: without it, `vendor` would take React in as a
 * dependency of the libraries it holds, and lazy chunks would import it from there.
 */
export const shellCodeSplitting = {
  groups: [
    { name: 'react', test: isReactModule, priority: 2 },
    { name: 'vendor', test: isVendorModule, tags: ['$initial' as const], priority: 1 },
  ],
}
