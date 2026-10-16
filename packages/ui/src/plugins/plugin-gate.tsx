import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { useAdminMeta } from '../app/meta-gate'
import { ProjectUiContext, type ProjectUi } from '../app/pages/project-ui'
import { Spinner } from '../primitives/spinner'
import { mergePlugins, type PluginOff } from './merge-plugins'
import { usePluginSource } from './plugin-source'
import { usePluginLoads } from './use-plugin-loads'

const PluginsOffContext = createContext<readonly PluginOff[]>([])

/** The plugins `/meta` names that the app did not load, and why. */
export const usePluginsOff = () => useContext(PluginsOffContext)

export type PluginGateProps = {
  /** The project's own UI config, built into the app. */
  ui?: ProjectUi
  children: ReactNode
}

/**
 * Loads the plugins `/meta` names, from the app's plugin source, and provides the project's UI config with theirs
 * merged in. It draws its children once they have loaded, or failed, or after a wait (see `usePluginLoads`); a plugin
 * that fails is left out, and its components draw what any missing component draws.
 */
export const PluginGate = ({ ui, children }: PluginGateProps) => {
  const { plugins = [] } = useAdminMeta()
  const { loads, settled } = usePluginLoads(plugins, usePluginSource())
  const merged = useMemo(() => mergePlugins(ui, loads), [ui, loads])
  if (!settled) {
    return (
      <div className="flex h-full min-h-48 items-center justify-center gap-2 text-muted-foreground">
        <Spinner /> Loading
      </div>
    )
  }
  return (
    <ProjectUiContext.Provider value={merged.ui}>
      <PluginsOffContext.Provider value={merged.off}>{children}</PluginsOffContext.Provider>
    </ProjectUiContext.Provider>
  )
}
