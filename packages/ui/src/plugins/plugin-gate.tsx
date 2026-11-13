import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { useAdminMeta } from '../app/meta-gate'
import { ProjectUiContext, type ProjectUi } from '../app/pages/project-ui'
import { HoldSplash } from '../app/splash-hold'
import { cn } from '../lib/cn'
import { revealLate } from '../primitives/skeleton'
import { Spinner } from '../primitives/spinner'
import { mergePlugins, type PluginOff } from './merge-plugins'
import { usePluginSource } from './plugin-source'
import { usePluginLoads } from './use-plugin-loads'
import { text } from './messages'

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
 * that fails is left out, and its components draw what any missing component draws. Its loading notice stays blank for
 * the first 180 ms, as a start from the cache usually has them from the browser's cache by then.
 */
export const PluginGate = ({ ui, children }: PluginGateProps) => {
  const { plugins = [] } = useAdminMeta()
  const { loads, settled } = usePluginLoads(plugins, usePluginSource())
  const merged = useMemo(() => mergePlugins(ui, loads), [ui, loads])
  if (!settled) {
    return (
      <div className={cn('flex h-full min-h-48 items-center justify-center gap-2 text-muted-foreground', revealLate)}>
        <HoldSplash />
        <Spinner /> {text('loading')}
      </div>
    )
  }
  return (
    <ProjectUiContext.Provider value={merged.ui}>
      <PluginsOffContext.Provider value={merged.off}>{children}</PluginsOffContext.Provider>
    </ProjectUiContext.Provider>
  )
}
