import { isLayoutNode, type LayoutNode } from './node'

/**
 * The element a JSON Pointer (RFC 6901) names in a tree, such as a plan read's `block`: `/children/0/props/actions/1`.
 * `undefined` when it names no element.
 */
export const elementAt = (tree: LayoutNode, pointer: string): LayoutNode | undefined => {
  if (pointer === '') return tree
  let value: unknown = tree
  for (const step of pointer.slice(1).split('/')) {
    const name = step.replaceAll('~1', '/').replaceAll('~0', '~')
    if (typeof value !== 'object' || value === null || !Object.hasOwn(value, name)) return
    value = (value as Record<string, unknown>)[name]
  }
  return isLayoutNode(value) ? value : undefined
}

/**
 * The pointer of an element below the one at `at`, step by step: `pointerOf('/children/0', 'props', 'actions', 1)` is
 * `/children/0/props/actions/1`, each step escaped as RFC 6901 says.
 */
export const pointerOf = (at: string, ...steps: Array<string | number>) => at + steps.map((step) => `/${String(step).replaceAll('~', '~0').replaceAll('/', '~1')}`).join('')
