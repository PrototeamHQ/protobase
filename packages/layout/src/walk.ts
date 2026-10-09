import { isLayoutNode, type LayoutChild, type LayoutNode, type LayoutValue } from './node'

/** Where an element sits: inside a record (a `RecordCard`, or one card of a `CardRow`) of `resource`, or not. */
export type Scope = { resource?: string; record: boolean }

export const pageScope: Scope = { record: false }

const recordScope = (node: LayoutNode): Scope => ({ resource: typeof node.props.resource === 'string' ? node.props.resource : undefined, record: true })

/** The scope of an element's children: each card of a `RecordCard` or `CardRow` is a record of its resource. */
export const childScope = (node: LayoutNode, scope: Scope): Scope =>
  !node.custom && (node.type === 'RecordCard' || node.type === 'CardRow') ? recordScope(node) : scope

/** The scope of the elements in a prop: a `RecordCard`'s header actions belong to its record, others to the parent's scope. */
export const propScope = (node: LayoutNode, scope: Scope): Scope => (!node.custom && node.type === 'RecordCard' ? recordScope(node) : scope)

export type Location = { path: string; scope: Scope }

const label = (node: LayoutNode) => `<${node.type}${typeof node.props.resource === 'string' ? ` resource="${node.props.resource}"` : ''}${typeof node.props.name === 'string' ? ` name="${node.props.name}"` : ''}>`

const isElements = (value: LayoutValue): value is LayoutNode | LayoutNode[] => isLayoutNode(value) || (Array.isArray(value) && value.length > 0 && value.every(isLayoutNode))

/**
 * Rebuilds the tree bottom-up through `visit`, which sees each element (with its children and element props already
 * rebuilt) and returns it, a replacement, or `null` to leave it out. Text children are kept as they are.
 */
export const mapTree = (
  node: LayoutNode,
  visit: (node: LayoutNode, at: Location) => LayoutNode | null,
  at: Location = { path: label(node), scope: pageScope },
): LayoutNode | null => {
  const inner = childScope(node, at.scope)
  const slot = propScope(node, at.scope)
  const children = node.children.flatMap((child): LayoutChild[] => {
    if (typeof child === 'string') return [child]
    const mapped = mapTree(child, visit, { path: `${at.path} › ${label(child)}`, scope: inner })
    return mapped ? [mapped] : []
  })
  const props = Object.fromEntries(
    Object.entries(node.props).flatMap(([name, value]): Array<[string, LayoutValue]> => {
      if (!isElements(value)) return [[name, value]]
      const mapped = (Array.isArray(value) ? value : [value]).flatMap((element) => mapTree(element, visit, { path: `${at.path} ${name}={${label(element)}}`, scope: slot }) ?? [])
      if (mapped.length === 0) return []
      return [[name, Array.isArray(value) ? mapped : mapped[0]!]]
    }),
  )
  return visit({ ...node, props, children }, at)
}

/** Calls `visit` for every element, parents first. */
export const walkTree = (node: LayoutNode, visit: (node: LayoutNode, at: Location) => void, at: Location = { path: label(node), scope: pageScope }) => {
  visit(node, at)
  const inner = childScope(node, at.scope)
  const slot = propScope(node, at.scope)
  for (const child of node.children) if (typeof child !== 'string') walkTree(child, visit, { path: `${at.path} › ${label(child)}`, scope: inner })
  for (const [name, value] of Object.entries(node.props)) {
    if (!isElements(value)) continue
    for (const element of Array.isArray(value) ? value : [value]) walkTree(element, visit, { path: `${at.path} ${name}={${label(element)}}`, scope: slot })
  }
}
