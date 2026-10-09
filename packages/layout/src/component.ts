import { blockSpecs } from './block-specs'
import { defineBlock, fragmentName } from './create-node'
import type { LayoutChildren } from './node'

const componentName = /^[A-Z][A-Za-z0-9]*$/

/**
 * Declares a custom component for layouts: `<UsageChart metric="cpu" />` becomes an element of type `UsageChart`,
 * which the app renders with the React component registered under that name. Its props must be static values too.
 */
export const component = <P extends object = Record<string, never>>(name: string) => {
  if (!componentName.test(name)) throw new Error(`Component name "${name}" must be PascalCase, such as UsageChart`)
  if (Object.hasOwn(blockSpecs, name) || name === fragmentName) throw new Error(`"${name}" is a built-in block; give the custom component another name`)
  return defineBlock<P & { children?: LayoutChildren }>(name, true)
}
