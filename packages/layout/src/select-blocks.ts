import type { BlockReads, ComponentReads, LayoutNode } from './node'

/** The blocks whose `select` prop chooses one of their rows, into the page's address, for their children to draw. */
export const selectBlocks: ReadonlySet<string> = new Set(['Table', 'Timeline', 'Graph'])

/** The prop that names the records a built-in block's `select` chooses among: a graph's nodes, another's `resource`. */
export const selectResourceProp = (type: string) => (type === 'Graph' ? 'nodes' : 'resource')

/** A custom component's reads as a list, one or several. */
export const readList = (reads: ComponentReads): BlockReads[] => (Array.isArray(reads) ? reads : [reads])

/** The row a block's `select` chooses: the page parameter that holds its key, and the resource it is a record of. */
export type Selection = { param: string; resource: string | undefined }

const text = (value: unknown) => (typeof value === 'string' ? value : undefined)

/**
 * What an element's `select` chooses, for its children to draw: a built-in block's `select` among its `resource`, or
 * the prop a custom component's read names `select` among that read's resource. `undefined` without one.
 */
export const selectOf = (node: LayoutNode): Selection | undefined => {
  if (!node.custom) {
    const param = selectBlocks.has(node.type) ? text(node.props.select) : undefined
    return param === undefined ? undefined : { param, resource: text(node.props[selectResourceProp(node.type)]) }
  }
  const read = node.reads && readList(node.reads).find((each) => each.select !== undefined)
  const param = read && text(node.props[read.select!])
  return param === undefined ? undefined : { param, resource: text(node.props[read!.resource]) }
}
