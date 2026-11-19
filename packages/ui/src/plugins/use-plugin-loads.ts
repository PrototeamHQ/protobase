import { useEffect, useState, useSyncExternalStore } from 'react'
import type { PluginRef } from '@protobase/client'
import type { PluginLoad } from './load-plugin'
import type { PluginSource } from './plugin-source'

/** How long the app waits for its plugins before it draws without the ones still loading, which arrive later. */
export const pluginWaitMs = 10_000

type Loads = { key: string; refs?: string; loads: PluginLoad[]; settled: boolean }

const none: PluginLoad[] = []

/**
 * The plugins `refs` names, in their order, as they load. `settled` once every one has loaded or failed, or after
 * `pluginWaitMs`, so a slow plugin delays the app only that long. Without plugins it is settled at once, and so it is
 * when the source has loaded every one already, as before the app's first render.
 */
export const usePluginLoads = (refs: readonly PluginRef[], source: PluginSource) => {
  // The same plugins load again when the source forgets them (`pluginsChangedEvent`)
  const revision = useSyncExternalStore(source.subscribe, source.revision, source.revision)
  const named = JSON.stringify(refs)
  const key = `${named}#${revision}`
  const [state, setState] = useState<Loads>(() => loadedAlready(refs, source, key) ?? { key: '[]', loads: none, settled: true })

  useEffect(() => {
    if (refs.length === 0) return
    let active = true
    let waited = false
    const results: Array<PluginLoad | undefined> = refs.map(() => undefined)
    const publish = () => {
      if (!active) return
      const loads = results.filter((load): load is PluginLoad => load !== undefined)
      const settled = waited || loads.length === refs.length
      // Loading the same plugins again, what the app shows stays until every one has come
      setState((current) => (current.refs === named && current.settled && !settled ? current : { key, refs: named, loads, settled }))
    }
    const timer = setTimeout(() => {
      waited = true
      publish()
    }, pluginWaitMs)
    refs.forEach((ref, index) => {
      void source.load(ref).then((load) => {
        results[index] = load
        publish()
      })
    })
    return () => {
      active = false
      clearTimeout(timer)
    }
    // `key` stands for `refs`, whose identity changes with every /meta that names the same plugins
  }, [key, source])

  if (refs.length === 0) return { loads: none, settled: true }
  if (state.key === key) return state
  // The same plugins loading again: what the app shows stays meanwhile
  if (state.refs === named && state.settled) return state
  // Until the effect runs for new plugins, the app waits for them, unless they have all loaded already
  return loadedAlready(refs, source, key) ?? { loads: none, settled: false }
}

const loadedAlready = (refs: readonly PluginRef[], source: PluginSource, key: string): Loads | undefined => {
  if (refs.length === 0) return undefined
  const loads = refs.map((ref) => source.loaded(ref))
  return loads.every((load) => load !== undefined) ? { key, refs: JSON.stringify(refs), loads: loads as PluginLoad[], settled: true } : undefined
}
