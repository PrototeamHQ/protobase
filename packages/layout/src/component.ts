import { blockSpecs } from './block-specs'
import { defineBlock, fragmentName } from './create-node'
import type { Block, LayoutChildren } from './node'

const componentName = /^[A-Z][A-Za-z0-9]*$/

/** `plugin`: the plugin that provides the component at runtime, instead of the project's protobase.ui.tsx. */
export type ComponentOptions = { plugin?: string }

/**
 * Declares a custom component for layouts: `<UsageChart metric="cpu" />` becomes an element of type `UsageChart`,
 * which the app renders with the React component registered under that name. Its props must be static values too.
 * With `plugin`, a plugin provides it, so `protobase build` does not look for it in protobase.ui.tsx.
 */
export const component = <P extends object = Record<string, never>>(name: string, options: ComponentOptions = {}): Block<P & { children?: LayoutChildren }> & { readonly plugin?: string } => {
  if (!componentName.test(name)) throw new Error(`Component name "${name}" must be PascalCase, such as UsageChart`)
  if (Object.hasOwn(blockSpecs, name) || name === fragmentName) throw new Error(`"${name}" is a built-in block; give the custom component another name`)
  if (options.plugin !== undefined && options.plugin.trim() === '') throw new Error(`component('${name}') names an empty plugin; name the plugin that provides it`)
  const block = defineBlock<P & { children?: LayoutChildren }>(name, true)
  return options.plugin === undefined ? block : Object.assign(block, { plugin: options.plugin })
}
