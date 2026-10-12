import { mergeUi, UiConflictError } from '../app/pages/merge-ui'
import type { ProjectUi } from '../app/pages/project-ui'
import type { PluginLoad } from './load-plugin'

export type PluginOff = Extract<PluginLoad, { kind: 'off' }>

/**
 * The app's UI config with the loaded plugins' merged before it, in their order, and the plugins that are off: those
 * that did not load, and those that define a component or action handler the app or an earlier plugin defines, which
 * the app's or the earlier one keeps. A conflict within the app's own configs throws, as it does without plugins.
 */
export const mergePlugins = (project: ProjectUi | undefined, loads: readonly PluginLoad[]): { ui: ProjectUi; off: PluginOff[] } => {
  const own = mergeUi(project ?? {})
  const kept: ProjectUi[] = []
  const off: PluginOff[] = []
  for (const load of loads) {
    if (load.kind === 'off') {
      off.push(load)
      continue
    }
    try {
      mergeUi(...kept, load.ui, own)
      kept.push(load.ui)
    } catch (error) {
      if (!(error instanceof UiConflictError)) throw error
      off.push({ kind: 'off', url: load.plugin.url, name: load.plugin.name, reason: error.message })
    }
  }
  return { ui: kept.length === 0 ? own : mergeUi(...kept, own), off }
}
