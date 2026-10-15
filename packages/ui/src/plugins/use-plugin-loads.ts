import { useEffect, useState } from 'react'
import type { PluginRef } from '@protobase/client'
import type { PluginLoad } from './load-plugin'
import type { PluginSource } from './plugin-source'

/** How long the app waits for its plugins before it draws without the ones still loading, which arrive later. */
export const pluginWaitMs = 10_000

type Loads = { key: string; loads: PluginLoad[]; settled: boolean }

const none: PluginLoad[] = []

/**
 * The plugins `refs` names, in their order, as they load. `settled` once every one has loaded or failed, or after
 * `pluginWaitMs`, so a slow plugin delays the app only that long. Without plugins it is settled at once.
 */
export const usePluginLoads = (refs: readonly PluginRef[], source: PluginSource) => {
  const key = JSON.stringify(refs)
  const [state, setState] = useState<Loads>({ key: '[]', loads: none, settled: true })

  useEffect(() => {
    if (refs.length === 0) return
    let active = true
    let waited = false
    const results: Array<PluginLoad | undefined> = refs.map(() => undefined)
    const publish = () => {
      if (!active) return
      const loads = results.filter((load): load is PluginLoad => load !== undefined)
      setState({ key, loads, settled: waited || loads.length === refs.length })
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
  // Until the effect runs for new plugins, the app waits for them
  return state.key === key ? state : { loads: none, settled: false }
}
