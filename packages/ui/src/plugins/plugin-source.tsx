import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react'
import type { PluginRef } from '@protobase/client'
import { browserLoader, loadPlugin, type PluginLoad, type PluginLoader } from './load-plugin'

/**
 * The event a host dispatches on `window` when the app's plugins changed where they are served, such as Protobase's
 * official app once it has fetched a workspace's new plugin files: the app loads its plugins again and swaps them in
 * where they draw, keeping what it shows meanwhile. Their components start afresh; the old code stays in memory.
 */
export const pluginsChangedEvent = 'protobase:plugins-changed'

/**
 * Where the app's plugins come from: each loaded once for the page, by whichever gate asks for it first, or before the
 * app's first render; `loaded` is a plugin's load once it has settled, read at once. `forget` drops every load, so each
 * plugin loads again, and moves `revision` on, which `subscribe` tells.
 */
export type PluginSource = {
  load: (ref: PluginRef) => Promise<PluginLoad>
  loaded: (ref: PluginRef) => PluginLoad | undefined
  forget: () => void
  revision: () => number
  subscribe: (changed: () => void) => () => void
}

/** A source that loads with `loader` and keeps each plugin's load, so one named before and after sign-in loads once. */
export const createPluginSource = (loader: PluginLoader, base = () => window.location.href): PluginSource => {
  const loads = new Map<string, Promise<PluginLoad>>()
  const settled = new Map<string, PluginLoad>()
  const listeners = new Set<() => void>()
  let revision = 0
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
    forget: () => {
      loads.clear()
      settled.clear()
      revision += 1
      for (const changed of listeners) changed()
    },
    revision: () => revision,
    subscribe: (changed) => {
      listeners.add(changed)
      return () => void listeners.delete(changed)
    },
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
  useEffect(() => {
    const changed = () => source.forget()
    window.addEventListener(pluginsChangedEvent, changed)
    return () => window.removeEventListener(pluginsChangedEvent, changed)
  }, [source])
  return <PluginSourceContext.Provider value={source}>{children}</PluginSourceContext.Provider>
}

export const usePluginSource = () => {
  const source = useContext(PluginSourceContext)
  if (!source) throw new Error('usePluginSource must be used inside PluginSourceProvider')
  return source
}
