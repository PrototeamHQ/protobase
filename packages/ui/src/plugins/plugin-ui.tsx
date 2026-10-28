import type { ComponentType } from 'react'
import { mergeUi } from '../app/pages/merge-ui'
import type { FieldWidget } from '../app/field-types/field-widget'
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

// A field type whose parts draw inside its plugin.
const fieldWithin = (plugin: PluginInfo, name: string, widget: FieldWidget): FieldWidget => ({
  of: widget.of,
  display: within(plugin, widget.display, `fields.${name}.display`),
  ...(widget.editor && { editor: within(plugin, widget.editor, `fields.${name}.editor`) }),
  ...(widget.cell && { cell: within(plugin, widget.cell, `fields.${name}.cell`) }),
})

/**
 * A plugin's UI config from its module, read as a `protobase.ui.tsx` module and merged with the configs it extends,
 * named after the plugin: its components, field types, shell slots and `beforeSignIn` draw inside the plugin. Throws
 * `UiConflictError` when the configs it merges define a name twice.
 */
export const pluginUi = (plugin: PluginInfo, module: Record<string, unknown>): ProjectUi => {
  const ui = mergeUi({ ...uiFromModule(module), name: plugin.name })
  const components = Object.fromEntries(Object.entries(ui.components ?? {}).map(([name, Component]) => [name, within(plugin, Component, name)]))
  const fields = ui.fields && Object.fromEntries(Object.entries(ui.fields).map(([name, widget]) => [name, fieldWithin(plugin, name, widget)]))
  const shell = ui.shell && {
    ...(ui.shell.actions && { actions: within(plugin, ui.shell.actions, 'shell.actions') }),
    ...(ui.shell.rightPanel && { rightPanel: within(plugin, ui.shell.rightPanel, 'shell.rightPanel') }),
    ...(ui.shell.logo && { logo: within(plugin, ui.shell.logo, 'shell.logo') }),
    ...(ui.shell.bell && { bell: within(plugin, ui.shell.bell, 'shell.bell') }),
  }
  const beforeSignIn = ui.beforeSignIn && within(plugin, ui.beforeSignIn, 'beforeSignIn')
  return {
    name: plugin.name,
    components,
    ...(ui.actions && { actions: ui.actions }),
    ...(ui.dropRules && { dropRules: ui.dropRules }),
    ...(ui.boardDrops && { boardDrops: ui.boardDrops }),
    ...(ui.titles && { titles: ui.titles }),
    ...(ui.marks && { marks: ui.marks }),
    ...(fields && { fields }),
    ...(shell && { shell }),
    ...(beforeSignIn && { beforeSignIn }),
  }
}
