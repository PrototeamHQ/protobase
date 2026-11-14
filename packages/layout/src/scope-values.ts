import { fillFilter, fillText, parseTemplatePath, valueText, type PathLookup } from '@protobase/schema/internal'
import type { LayoutNode, LayoutValue } from './node'

// The records around an element as it draws, and the value a path reads from them, by the same Mustache lookup the
// build checks with: a bare name from the nearest record that has it, `../` and `this` from one record only.

/** One record of the stack, and its place among its rows when it is one of a `CardRow`'s. */
export type ValueFrame = { record: Record<string, unknown>; row?: { index: number; count: number } }

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
    if (parsed.variable === 'params') return scope.params?.[parsed.names[0]!]
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
  const context = contexts.findLast((record) => Object.hasOwn(record, first!))
  return context === undefined ? undefined : readRest(context[first!], rest)
}

/** How a filler reads values where `scope` is. */
export const scopeLookup = (scope: ValueScope): PathLookup => (path) => scopeValue(scope, path)

/** Props drawn as text, each `{{path}}` replaced by its value. */
const textProps = ['title', 'description', 'empty', 'label', 'recordKey']

/** Props that are filters or conditions, where a quoted `'{{path}}'` is escaped so any text stays one value. */
const filterProps = ['filter', 'when', 'working']

const fillValues = (value: LayoutValue, lookup: PathLookup): LayoutValue => {
  if (typeof value === 'string') return fillText(value, (path) => valueText(lookup(path)))
  if (Array.isArray(value)) return value.map((item) => fillValues(item, lookup))
  if (isObject(value)) return Object.fromEntries(Object.entries(value).map(([name, item]) => [name, fillValues(item, lookup)]))
  return value
}

/**
 * The element with every `{{path}}` in its text props (`title`, `description`, `empty`, `label`, `recordKey`), its
 * filters and conditions (`filter`, `when`, `working`) and its `values` replaced by the values where `scope` is. A
 * missing value becomes empty, as in Mustache. Custom components and other props are left as they are.
 */
export const fillProps = (node: LayoutNode, scope: ValueScope): LayoutNode => {
  // Unchanged when it has nothing to fill, so a block's props keep their identity from draw to draw
  if (node.custom || !JSON.stringify(node.props).includes('{{')) return node
  const lookup = scopeLookup(scope)
  const props = { ...node.props }
  for (const name of textProps) if (typeof props[name] === 'string') props[name] = fillText(props[name], (path) => valueText(lookup(path)))
  for (const name of filterProps) if (typeof props[name] === 'string') props[name] = fillFilter(props[name], lookup)
  if (isObject(props.filter)) props.filter = fillValues(props.filter, lookup)
  if (props.values !== undefined) props.values = fillValues(props.values, lookup)
  return { ...node, props }
}
