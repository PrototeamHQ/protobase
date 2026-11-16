import { fillFilter, fillText, parseTemplatePath, valueText, wholePlaceholder, type PathLookup } from '@protobase/schema/internal'
import { isLayoutNode, type LayoutNode, type LayoutValue } from './node'
import { readList } from './select-blocks'

// The records around an element as it draws, and the value a path reads from them, by the same Mustache lookup the
// build checks with: a bare name from the nearest record that has it, `../` and `this` from one record only.

/**
 * One record of the stack, or an item of an `ArrayField`'s list, which may be any JSON value, and its place among its
 * rows when it is one of a `CardRow`'s or a `RecordsIterator`'s.
 */
export type ValueFrame = { record: unknown; row?: { index: number; count: number } }

/** The records around an element, outermost first, the page's own record, and the page's parameters. */
export type ValueScope = { stack: readonly ValueFrame[]; root?: Record<string, unknown>; params?: Readonly<Record<string, string>> }

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

// The rest of a dotted name, read from the value its first name found only: Mustache's "Dotted Names - Context Precedence".
const readRest = (value: unknown, names: string[]) => names.reduce<unknown>((at, name) => (isObject(at) && Object.hasOwn(at, name) ? at[name] : undefined), value)

/** The value at `path` where `scope` is; `undefined` for a path that is none or names nothing. */
export const scopeValue = (scope: ValueScope, path: string): unknown => {
  const parsed = parseTemplatePath(path)
  if (!parsed) return
  if (parsed.kind === 'data') {
    if (parsed.variable === 'root') return scope.root === undefined ? undefined : readRest(scope.root, parsed.names)
    // Its own values only, so a parameter named `constructor` with no value reads none, not the object's
    if (parsed.variable === 'params') return scope.params && Object.hasOwn(scope.params, parsed.names[0]!) ? scope.params[parsed.names[0]!] : undefined
    const row = scope.stack.findLast((frame) => frame.row !== undefined)?.row
    if (!row) return
    return parsed.variable === 'index' ? row.index : parsed.variable === 'first' ? row.index === 0 : row.index === row.count - 1
  }
  const contexts = [...(scope.root === undefined ? [] : [scope.root]), ...scope.stack.map((frame) => frame.record)]
  if (parsed.explicit) {
    const context = contexts[contexts.length - 1 - parsed.up]
    return context === undefined ? undefined : readRest(context, parsed.names)
  }
  const [first, ...rest] = parsed.names
  const context = contexts.findLast((record) => isObject(record) && Object.hasOwn(record, first!))
  return isObject(context) ? readRest(context[first!], rest) : undefined
}

/** How a filler reads values where `scope` is. */
export const scopeLookup = (scope: ValueScope): PathLookup => (path) => scopeValue(scope, path)

const scalar = (value: unknown): LayoutValue => (value === undefined ? null : typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || value === null ? value : valueText(value))

// A filter object's value that is one whole `{{path}}` takes the value itself, so a number stays a number for the read
const fillFilterObject = (filter: Record<string, LayoutValue>, lookup: PathLookup) =>
  Object.fromEntries(Object.entries(filter).map(([name, value]) => {
    const whole = typeof value === 'string' ? wholePlaceholder(value) : undefined
    return [name, whole === undefined ? fillValues(value, lookup) : scalar(lookup(whole))]
  }))

/** Props drawn as text, each `{{path}}` replaced by its value. */
const textProps = ['title', 'description', 'empty', 'label', 'recordKey']

/** Props that are filters or conditions, where a quoted `'{{path}}'` is escaped so any text stays one value. */
const filterProps = ['filter', 'when', 'working', 'edgeFilter', 'animated', 'dashed', 'dotted']

const fillValues = (value: LayoutValue, lookup: PathLookup): LayoutValue => {
  if (typeof value === 'string') return fillText(value, (path) => valueText(lookup(path)))
  if (Array.isArray(value)) return value.map((item) => fillValues(item, lookup))
  if (isObject(value)) return Object.fromEntries(Object.entries(value).map(([name, item]) => [name, fillValues(item, lookup)]))
  return value
}

/**
 * The element with every `{{path}}` in its text props (`title`, `description`, `empty`, `label`, `recordKey`), its
 * filters and conditions (`filter`, `when`, `working`, a graph's `edgeFilter` and edge conditions, a thread's `calls.filter`) and its `values` replaced by the values where `scope` is. A
 * missing value becomes empty, as in Mustache. Custom components and other props are left as they are.
 */
export const fillProps = (node: LayoutNode, scope: ValueScope): LayoutNode => {
  // Unchanged when it has nothing to fill, so a block's props keep their identity from draw to draw
  if (node.custom || !JSON.stringify(node.props).includes('{{')) return node
  const lookup = scopeLookup(scope)
  const props = { ...node.props }
  for (const name of textProps) if (typeof props[name] === 'string') props[name] = fillText(props[name], (path) => valueText(lookup(path)))
  // A <Trans> drawn as a prop's text fills its own values where the element is
  for (const name of textProps) {
    const value = props[name]
    if (isLayoutNode(value) && value.type === 'Trans') props[name] = fillProps(value, scope)
  }
  for (const name of filterProps) if (typeof props[name] === 'string') props[name] = fillFilter(props[name], lookup)
  if (isObject(props.filter)) props.filter = fillFilterObject(props.filter as Record<string, LayoutValue>, lookup)
  if (props.values !== undefined) props.values = fillValues(props.values, lookup)
  // A thread's tool calls are read by a filter of their own
  if (isObject(props.calls) && typeof props.calls.filter === 'string') props.calls = { ...props.calls, filter: fillFilter(props.calls.filter, lookup) }
  return { ...node, props }
}

/**
 * A custom component's element with the `{{path}}`s of the filters its reads name filled from `scope`, as a built-in
 * block's `filter` is, for a read it makes by itself where the page plans none. Its other props stay as they are.
 */
export const fillComponentReads = (node: LayoutNode, scope: ValueScope): LayoutNode => {
  if (!node.custom || !node.reads) return node
  const lookup = scopeLookup(scope)
  const props = { ...node.props }
  // Each prop once, from its written value, so two reads naming the same one never fill text already filled
  const filters = new Set(readList(node.reads).flatMap(({ filter }) => (filter === undefined ? [] : [filter])))
  for (const filter of filters) {
    const value = node.props[filter]
    if (typeof value === 'string') props[filter] = fillFilter(value, lookup)
    else if (isObject(value)) props[filter] = fillFilterObject(value as Record<string, LayoutValue>, lookup)
  }
  return { ...node, props }
}
