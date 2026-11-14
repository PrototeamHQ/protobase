import { isLayoutNode, type LayoutChild, type LayoutNode, type LayoutValue } from './node'

/**
 * One context of the stack, as Mustache calls it: the record of a `RecordCard` or `ReferenceField`, or one of the rows
 * of a `CardRow` or `RecordsIterator`, which `@index`, `@first` and `@last` count. `item` marks an item of an
 * `ArrayField`, a JSON value with no model, so any name may be one of its keys. `block` names the element that pushed
 * it, for messages.
 */
export type Frame = { resource?: string; repeated: boolean; item?: true; block: string }

/**
 * The list a `ReferenceManyField`, `ReferenceArrayField` or `ArrayField` puts around its children, which a
 * `RecordsIterator` or a `Table` without `resource` draws: the records of `resource`, or with `items` a JSON list's items.
 */
export type ListFrame = { resource?: string; items: boolean; block: string }

/**
 * Where an element sits: the records around it, outermost first, `root`, the resource of the page's own record on a
 * page that has one (`@root`), and the list around it, until a record is pushed. A composed page has none.
 */
export type Scope = { stack: readonly Frame[]; root?: string; list?: ListFrame }

export const pageScope: Scope = { stack: [] }

/** The record nearest around an element, if any. */
export const innermost = (scope: Scope): Frame | undefined => scope.stack.at(-1)

const text = (value: unknown) => (typeof value === 'string' ? value : undefined)

// A record pushed ends the list around it: a RecordsIterator inside it would draw another list's records
const pushed = (scope: Scope, frame: Frame): Scope => ({ stack: [...scope.stack, frame], ...(scope.root !== undefined && { root: scope.root }) })

const listed = (scope: Scope, list: ListFrame): Scope => ({ ...scope, list })

/**
 * The scope of an element's children: a `RecordCard` and a `ReferenceField` push their record, a `CardRow` each of its
 * rows, a `RecordsIterator` each record or item of the list around it; a list context puts its list around them.
 */
export const childScope = (node: LayoutNode, scope: Scope): Scope => {
  if (node.custom) return scope
  const block = label(node)
  switch (node.type) {
    case 'RecordCard':
    case 'CardRow':
      return pushed(scope, { resource: text(node.props.resource), repeated: node.type === 'CardRow', block })
    case 'ReferenceField':
      return pushed(scope, { resource: text(node.props.reference), repeated: false, block })
    case 'ReferenceManyField':
    case 'ReferenceArrayField':
      return listed(scope, { resource: text(node.props.reference), items: false, block })
    case 'ArrayField':
      return listed(scope, { items: true, block })
    case 'RecordsIterator':
      if (!scope.list) return scope
      return pushed(scope, { ...(scope.list.resource !== undefined && { resource: scope.list.resource }), repeated: true, ...(scope.list.items && { item: true as const }), block: scope.list.block })
    default:
      return scope
  }
}

/** The scope of the elements in a prop: a `RecordCard`'s header actions belong to its record, others to the parent's scope. */
export const propScope = (node: LayoutNode, scope: Scope): Scope => (!node.custom && node.type === 'RecordCard' ? childScope(node, scope) : scope)

export type Location = { path: string; scope: Scope }

export const label = (node: LayoutNode) => `<${node.type}${typeof node.props.resource === 'string' ? ` resource="${node.props.resource}"` : ''}${typeof node.props.reference === 'string' ? ` reference="${node.props.reference}"` : ''}${typeof node.props.source === 'string' ? ` source="${node.props.source}"` : ''}${typeof node.props.name === 'string' ? ` name="${node.props.name}"` : ''}>`

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
