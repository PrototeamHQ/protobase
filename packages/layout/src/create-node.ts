import { isLayoutNode, type Block, type ComponentReads, type LayoutChild, type LayoutNode, type LayoutValue } from './node'
import { Condition, Now, fieldRecorder, inScope, isRecorded, keepScope, markScope, placeholder, recorder } from './typed/record'

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
  // What a typed layout records: a path read is its placeholder, a condition or a time its AIP-160 text
  if (isRecorded(value)) return placeholder(value)
  if (value instanceof Condition || value instanceof Now) return value.toString()
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (Array.isArray(value)) return value.map((item, index) => staticValue(item, `${where.slice(0, -1)}[${index}]>`))
  if (typeof value === 'object' && isPlainObject(value)) {
    const copy = Object.fromEntries(Object.entries(value).flatMap(([key, item]) => (item === undefined ? [] : [[key, staticValue(item, `${where.slice(0, -1)}.${key}>`)]])))
    // An element in a prop keeps the records its child function gave, which its paths are written by
    keepScope(value, copy)
    return copy
  }
  throw new Error(`${where} is ${describe(value)}. ${advice}`)
}

/** Flattens arrays and fragments, drops `null`, `undefined` and booleans, and turns numbers into text, like React. */
export const normalizeChildren = (children: unknown, where: string): LayoutChild[] => {
  if (children === undefined || children === null || typeof children === 'boolean') return []
  if (typeof children === 'string') return [children]
  if (isRecorded(children)) return [placeholder(children)]
  if (typeof children === 'number' && Number.isFinite(children)) return [String(children)]
  if (Array.isArray(children)) return children.flatMap((child) => normalizeChildren(child, where))
  if (isLayoutNode(children)) return children.type === fragmentName && !children.custom ? children.children : [children]
  throw new Error(`${where} has a child that is ${describe(children)}. ${advice}`)
}

export const fragmentName = 'Fragment'

const isBlock = (type: unknown): type is Block<unknown> => typeof type === 'function' && typeof (type as Block<unknown>).blockName === 'string'

/** The blocks that draw their children inside a record of their own, whose children may be a function of that record. */
export const recordChildBlocks = ['RecordCard', 'CardRow', 'ReferenceField', 'RecordsIterator']

/** The props that are a condition on a block's own records, which a typed layout writes as an arrow of their fields. */
const conditionArrows = ['filter', 'edgeFilter', 'animated', 'dashed', 'dotted']

// A typed layout's props as the static tree holds them: a filter's or condition's arrow called with the resource's
// fields, and a sort's entries as one AIP-132 text
const builtProps = (name: string, props: Record<string, unknown>) => {
  const built = { ...props }
  for (const prop of conditionArrows) {
    const value = built[prop]
    if (typeof value === 'function') {
      const condition = (value as (fields: unknown) => unknown)(fieldRecorder())
      if (!(condition instanceof Condition)) throw new Error(`<${name} ${prop}> is an arrow that gives no condition: write (f) => f.status.eq('open'), or the ${prop} as AIP-160 text`)
      built[prop] = condition.text
    } else if (typeof value === 'object' && value !== null && !(value instanceof Condition)) {
      throw new Error(`<${name} ${prop}> is an object: write the ${prop} as an arrow, (f) => f.status.eq('open'), or as AIP-160 text`)
    }
  }
  if (built.sort !== undefined) {
    if (!Array.isArray(built.sort) || !built.sort.every((entry) => typeof entry === 'string')) throw new Error(`<${name} sort> takes a list of fields, each with asc or desc if it likes: sort={['next_run_at asc']}`)
    built.sort = built.sort.join(', ')
  }
  return built
}

// A record block's children: a function of its record, called once with a recorder of a scope of its own, which the
// element is marked with, or the elements
const builtChildren = (name: string, children: unknown, where: string): { children: LayoutChild[]; scope?: number } => {
  if (typeof children !== 'function') return { children: normalizeChildren(children, where) }
  if (!recordChildBlocks.includes(name)) throw new Error(`<${name}> takes elements as children; only ${recordChildBlocks.join(', ')} take a function of their record`)
  const { scope, built } = inScope((own) => normalizeChildren((children as (record: unknown) => unknown)(recorder([], own)), where))
  return { children: built, scope }
}

/** The blocks with a prop of elements drawn once per record of their own, which may be a function of that record. */
export const recordPropBlocks: Readonly<Record<string, string>> = { Graph: 'node' }

/** The built-in blocks that take a `fallback`, drawn where they cannot draw, which the element holds as a component's. */
export const fallbackBlocks: ReadonlySet<string> = new Set(['Graph'])

// A prop of elements drawn once per record, a function of it called as a record block's children are: stored as one
// element, itself or a Box around several, with the scope of the function that built it
const builtRecordProp = (name: string, prop: string, value: unknown): { value: unknown; scope?: number } => {
  const where = `<${name} ${prop}>`
  const one = (children: LayoutChild[]): LayoutNode => {
    const [only] = children
    return children.length === 1 && typeof only === 'object' ? only : { type: 'Box', props: {}, children }
  }
  if (typeof value !== 'function') return { value: value === undefined || isLayoutNode(value) ? value : one(normalizeChildren(value, where)) }
  const { scope, built } = inScope((own) => normalizeChildren((value as (record: unknown) => unknown)(recorder([], own)), where))
  return { value: one(built), scope }
}

/** The element for `<type {...props} />`: checks that every prop and child is static and returns plain data. */
export const createNode = (type: unknown, props: Record<string, unknown>): LayoutNode => {
  if (typeof type === 'string') throw new Error(`<${type}> is an HTML element, not a layout block: use the blocks from @protobase/layout or a custom component`)
  if (!isBlock(type)) {
    throw new Error(`<${typeof type === 'function' && type.name ? type.name : 'unknown'}> is not a layout block. Components in a layout are declared with component('Name') and implemented in the app; ${advice}`)
  }
  const name = type.blockName
  const { children, ...written } = props
  // A built-in block's fallback is the element's, as a component's is
  const ownFallback = !type.custom && fallbackBlocks.has(name)
  const { fallback, ...taken } = written
  const given = ownFallback ? taken : written
  const rest = type.custom ? given : builtProps(name, given)
  const recordProp = type.custom ? undefined : recordPropBlocks[name]
  const perRecord = recordProp === undefined ? undefined : builtRecordProp(name, recordProp, rest[recordProp])
  if (recordProp !== undefined) rest[recordProp] = perRecord!.value
  const built = type.custom ? { children: normalizeChildren(children, `<${name}>`) } : builtChildren(name, children, `<${name}>`)
  const node: LayoutNode = {
    type: name,
    props: Object.fromEntries(Object.entries(rest).flatMap(([key, value]) => (value === undefined ? [] : [[key, staticValue(value, `<${name} ${key}>`)]]))),
    children: built.children,
  }
  // One element holds the records of one function: its children's, or else its prop's
  const scope = built.scope ?? perRecord?.scope
  if (scope !== undefined) markScope(node, scope)
  if (type.custom) node.custom = true
  if (type.fallback) node.fallback = type.fallback
  if (ownFallback && fallback !== undefined) node.fallback = normalizeChildren(fallback, `<${name} fallback>`)
  if (type.reads) node.reads = type.reads
  return node
}

/**
 * Declares a block named `name`; `custom` marks a component the app implements in React, drawn as `fallback` where it
 * cannot be, and reading what `reads` names.
 */
export const defineBlock = <P>(name: string, custom: boolean, fallback?: LayoutChild[], reads?: ComponentReads): Block<P> => {
  const block: Block<P> = Object.assign((props: P) => createNode(block, props as Record<string, unknown>), { blockName: name, custom, ...(fallback && { fallback }), ...(reads && { reads }) })
  return block
}
