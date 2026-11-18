import { createContext, useContext, useMemo, type ReactNode } from 'react'
import type { PluginRef } from '@protobase/client'
import { browserLoader, loadPlugin, type PluginLoad, type PluginLoader } from './load-plugin'

/**
 * Where the app's plugins come from: each loaded once for the page, by whichever gate asks for it first, or before the
 * app's first render; `loaded` is a plugin's load once it has settled, read at once.
 */
export type PluginSource = { load: (ref: PluginRef) => Promise<PluginLoad>; loaded: (ref: PluginRef) => PluginLoad | undefined }

/** A source that loads with `loader` and keeps each plugin's load, so one named before and after sign-in loads once. */
export const createPluginSource = (loader: PluginLoader, base = () => window.location.href): PluginSource => {
  const loads = new Map<string, Promise<PluginLoad>>()
  const settled = new Map<string, PluginLoad>()
  return {
    load: (ref) => {
      const key = JSON.stringify(ref)
      const known = loads.get(key)
      if (known) return known
      const load = loadPlugin(ref, loader, base())
      loads.set(key, load)
      void load.then((result) => settled.set(key, result))
      return load
    },
    loaded: (ref) => settled.get(JSON.stringify(ref)),
  }
}

/**
 * Loads `refs` ahead of the app's first render, such as the plugins the start cache's `/meta` names, so the plugin gate
 * draws the app with them at once; at most `waitMs`, after which the app starts and the slow ones arrive later.
 */
export const preloadPlugins = (source: PluginSource, refs: readonly PluginRef[], waitMs: number) =>
  Promise.race([Promise.all(refs.map((ref) => source.load(ref))), new Promise((resolve) => setTimeout(resolve, waitMs))]).then(() => undefined)

const PluginSourceContext = createContext<PluginSource | null>(null)

/** The app's plugin source: `source` when the page made one before rendering, or one loading with `loader`, the page's `fetch` and `import()` by default. */
export const PluginSourceProvider = ({ loader = browserLoader, source: given, children }: { loader?: PluginLoader; source?: PluginSource; children: ReactNode }) => {
  const source = useMemo(() => given ?? createPluginSource(loader), [given, loader])
  return <PluginSourceContext.Provider value={source}>{children}</PluginSourceContext.Provider>
}

export const usePluginSource = () => {
  const source = useContext(PluginSourceContext)
  if (!source) throw new Error('usePluginSource must be used inside PluginSourceProvider')
  return source
}
