import type { ComponentType } from 'react'
import { mergeUi } from '../app/pages/merge-ui'
import type { ProjectUi } from '../app/pages/project-ui'
import { uiFromModule } from '../app/pages/ui-from-module'
import { PluginProvider, type PluginInfo } from './plugin-context'

// The component drawn inside its plugin, so it and everything it renders read the plugin with usePlugin().
const within = (plugin: PluginInfo, Component: ComponentType<any>, name: string): ComponentType<any> => {
  const Within = (props: Record<string, unknown>) => (
    <PluginProvider value={plugin}>
      <Component {...props} />
    </PluginProvider>
  )
  Within.displayName = `${plugin.name}:${name}`
  return Within
}

/**
 * A plugin's UI config from its module, read as a `protobase.ui.tsx` module and merged with the configs it extends,
 * named after the plugin: its components and shell slots draw inside the plugin. Throws `UiConflictError` when the
 * configs it merges define a name twice.
 */
export const pluginUi = (plugin: PluginInfo, module: Record<string, unknown>): ProjectUi => {
  const ui = mergeUi({ ...uiFromModule(module), name: plugin.name })
  const components = Object.fromEntries(Object.entries(ui.components ?? {}).map(([name, Component]) => [name, within(plugin, Component, name)]))
  const shell = ui.shell && {
    ...(ui.shell.actions && { actions: within(plugin, ui.shell.actions, 'shell.actions') }),
    ...(ui.shell.rightPanel && { rightPanel: within(plugin, ui.shell.rightPanel, 'shell.rightPanel') }),
  }
  return { name: plugin.name, components, ...(ui.actions && { actions: ui.actions }), ...(shell && { shell }) }
}
