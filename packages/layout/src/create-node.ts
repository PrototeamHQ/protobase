import { isLayoutNode, type Block, type LayoutChild, type LayoutNode, type LayoutValue } from './node'

const advice = 'Layouts are static data, sent to the browser as JSON: use <Action name="..."> for behaviour, or register a custom component for React code.'

const describe = (value: unknown) => {
  if (typeof value === 'function') return 'a function'
  if (typeof value === 'number') return String(value)
  if (typeof value !== 'object' || value === null) return `a ${typeof value}`
  return `a ${value.constructor?.name ?? 'object without prototype'}`
}

const isPlainObject = (value: object) => {
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

/** Throws unless `value` is JSON-safe data: strings, finite numbers, booleans, null, arrays and plain objects of those. */
export const staticValue = (value: unknown, where: string): LayoutValue => {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (Array.isArray(value)) return value.map((item, index) => staticValue(item, `${where.slice(0, -1)}[${index}]>`))
  if (typeof value === 'object' && isPlainObject(value)) {
    return Object.fromEntries(Object.entries(value).flatMap(([key, item]) => (item === undefined ? [] : [[key, staticValue(item, `${where.slice(0, -1)}.${key}>`)]])))
  }
  throw new Error(`${where} is ${describe(value)}. ${advice}`)
}

/** Flattens arrays and fragments, drops `null`, `undefined` and booleans, and turns numbers into text, like React. */
export const normalizeChildren = (children: unknown, where: string): LayoutChild[] => {
  if (children === undefined || children === null || typeof children === 'boolean') return []
  if (typeof children === 'string') return [children]
  if (typeof children === 'number' && Number.isFinite(children)) return [String(children)]
  if (Array.isArray(children)) return children.flatMap((child) => normalizeChildren(child, where))
  if (isLayoutNode(children)) return children.type === fragmentName && !children.custom ? children.children : [children]
  throw new Error(`${where} has a child that is ${describe(children)}. ${advice}`)
}

export const fragmentName = 'Fragment'

const isBlock = (type: unknown): type is Block<unknown> => typeof type === 'function' && typeof (type as Block<unknown>).blockName === 'string'

/** The element for `<type {...props} />`: checks that every prop and child is static and returns plain data. */
export const createNode = (type: unknown, props: Record<string, unknown>): LayoutNode => {
  if (typeof type === 'string') throw new Error(`<${type}> is an HTML element, not a layout block: use the blocks from @protobase/layout or a custom component`)
  if (!isBlock(type)) {
    throw new Error(`<${typeof type === 'function' && type.name ? type.name : 'unknown'}> is not a layout block. Components in a layout are declared with component('Name') and implemented in the app; ${advice}`)
  }
  const name = type.blockName
  const { children, ...rest } = props
  const node: LayoutNode = {
    type: name,
    props: Object.fromEntries(Object.entries(rest).flatMap(([key, value]) => (value === undefined ? [] : [[key, staticValue(value, `<${name} ${key}>`)]]))),
    children: normalizeChildren(children, `<${name}>`),
  }
  if (type.custom) node.custom = true
  return node
}

/** Declares a block named `name`; `custom` marks a component the app implements in React. */
export const defineBlock = <P>(name: string, custom: boolean): Block<P> => {
  const block: Block<P> = Object.assign((props: P) => createNode(block, props as Record<string, unknown>), { blockName: name, custom })
  return block
}
