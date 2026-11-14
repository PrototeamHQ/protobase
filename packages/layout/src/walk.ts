import { isLayoutNode, type LayoutChild, type LayoutNode, type LayoutValue } from './node'

/**
 * One context of the stack, as Mustache calls it: the record of a `RecordCard`, or one of the rows of a `CardRow`,
 * which `@index`, `@first` and `@last` count. `block` names the element that pushed it, for messages.
 */
export type Frame = { resource?: string; repeated: boolean; block: string }

/**
 * Where an element sits: the records around it, outermost first, and `root`, the resource of the page's own record on
 * a page that has one (`@root`). A composed page has none.
 */
export type Scope = { stack: readonly Frame[]; root?: string }

export const pageScope: Scope = { stack: [] }

/** The record nearest around an element, if any. */
export const innermost = (scope: Scope): Frame | undefined => scope.stack.at(-1)

const pushed = (node: LayoutNode, scope: Scope): Scope => ({
  ...scope,
  stack: [...scope.stack, { resource: typeof node.props.resource === 'string' ? node.props.resource : undefined, repeated: node.type === 'CardRow', block: label(node) }],
})

/** The scope of an element's children: a `RecordCard` pushes its record, a `CardRow` each of its rows. */
export const childScope = (node: LayoutNode, scope: Scope): Scope =>
  !node.custom && (node.type === 'RecordCard' || node.type === 'CardRow') ? pushed(node, scope) : scope

/** The scope of the elements in a prop: a `RecordCard`'s header actions belong to its record, others to the parent's scope. */
export const propScope = (node: LayoutNode, scope: Scope): Scope => (!node.custom && node.type === 'RecordCard' ? pushed(node, scope) : scope)

export type Location = { path: string; scope: Scope }

export const label = (node: LayoutNode) => `<${node.type}${typeof node.props.resource === 'string' ? ` resource="${node.props.resource}"` : ''}${typeof node.props.name === 'string' ? ` name="${node.props.name}"` : ''}${typeof node.props.source === 'string' ? ` source="${node.props.source}"` : ''}>`

const isElements = (value: LayoutValue): value is LayoutNode | LayoutNode[] => isLayoutNode(value) || (Array.isArray(value) && value.length > 0 && value.every(isLayoutNode))

/**
 * Rebuilds the tree bottom-up through `visit`, which sees each element (with its children, element props and fallback
 * already rebuilt) and returns it, a replacement, or `null` to leave it out. Text children are kept as they are.
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
  // A fallback stands in the component's place, so it sits in the component's scope
  const fallback = node.fallback?.flatMap((child): LayoutChild[] => {
    if (typeof child === 'string') return [child]
    const mapped = mapTree(child, visit, { path: `${at.path} fallback={${label(child)}}`, scope: at.scope })
    return mapped ? [mapped] : []
  })
  return visit({ ...node, props, children, ...(fallback && { fallback }) }, at)
}

/** Calls `visit` for every element, fallbacks included, parents first. */
export const walkTree = (node: LayoutNode, visit: (node: LayoutNode, at: Location) => void, at: Location = { path: label(node), scope: pageScope }) => {
  visit(node, at)
  const inner = childScope(node, at.scope)
  const slot = propScope(node, at.scope)
  for (const child of node.children) if (typeof child !== 'string') walkTree(child, visit, { path: `${at.path} › ${label(child)}`, scope: inner })
  for (const [name, value] of Object.entries(node.props)) {
    if (!isElements(value)) continue
    for (const element of Array.isArray(value) ? value : [value]) walkTree(element, visit, { path: `${at.path} ${name}={${label(element)}}`, scope: slot })
  }
  for (const child of node.fallback ?? []) if (typeof child !== 'string') walkTree(child, visit, { path: `${at.path} fallback={${label(child)}}`, scope: at.scope })
}
