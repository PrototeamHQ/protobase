import { blockSpecs, type BlockReads } from './block-specs'
import { defineBlock, fragmentName, normalizeChildren } from './create-node'
import type { Block, LayoutChildren } from './node'

const componentName = /^[A-Z][A-Za-z0-9]*$/

export type ComponentOptions = {
  /** The plugin that provides the component at runtime, instead of the project's protobase.ui.tsx. */
  plugin?: string
  /** What a client without the component, or where it fails to draw, shows instead: elements, or `[]` for nothing. */
  fallback?: LayoutChildren
  /**
   * Which of its props name what it reads, such as `{ resource: 'resource', filter: 'filter' }`, so the page's read
   * plan reads it with the rest at page load. Without it, the component is outside the plan and reads by itself.
   */
  reads?: BlockReads
}

/**
 * Declares a custom component for layouts: `<UsageChart metric="cpu" />` becomes an element of type `UsageChart`,
 * which the app renders with the React component registered under that name. Its props must be static values too.
 * With `plugin`, a plugin provides it, so `protobase build` does not look for it in protobase.ui.tsx. With `fallback`,
 * a client that cannot draw it, such as one without the component or the web when it throws, draws those elements.
 * With `reads`, the page's read plan reads what its props name.
 */
export const component = <P extends object = Record<string, never>>(name: string, options: ComponentOptions = {}): Block<P & { children?: LayoutChildren }> & { readonly plugin?: string } => {
  if (!componentName.test(name)) throw new Error(`Component name "${name}" must be PascalCase, such as UsageChart`)
  if (Object.hasOwn(blockSpecs, name) || name === fragmentName) throw new Error(`"${name}" is a built-in block; give the custom component another name`)
  if (options.plugin !== undefined && options.plugin.trim() === '') throw new Error(`component('${name}') names an empty plugin; name the plugin that provides it`)
  const fallback = options.fallback === undefined ? undefined : normalizeChildren(options.fallback, `component('${name}') fallback`)
  if (options.reads !== undefined && Object.values(options.reads).some((prop) => typeof prop !== 'string' || prop.trim() === '')) throw new Error(`component('${name}') reads must name its props, such as { resource: 'resource' }`)
  const block = defineBlock<P & { children?: LayoutChildren }>(name, true, fallback, options.reads)
  return options.plugin === undefined ? block : Object.assign(block, { plugin: options.plugin })
}
