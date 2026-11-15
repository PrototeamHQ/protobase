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
