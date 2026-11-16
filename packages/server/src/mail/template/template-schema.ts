import { isLayoutNode, parseCondition, type LayoutNode, type LayoutValue } from '@protobase/layout'
import { parseTemplatePath, templatePlaceholders } from '@protobase/schema/internal'

// The data a template reads, as a JSON Schema, derived from its tree when it gives no schema of its own: each path its
// placeholders, fields, lists and conditions name, nested by its dots, a list's item fields under the list.

export type JsonSchema = Record<string, unknown>

type Shape = { fields: Map<string, Shape>; list?: boolean }

const shape = (): Shape => ({ fields: new Map() })

const at = (root: Shape, path: string[], list = false) => {
  let node = root
  for (const name of path) {
    if (!node.fields.has(name)) node.fields.set(name, shape())
    node = node.fields.get(name)!
  }
  if (list) node.list = true
  return node
}

// The record a path reads from: the list item it sits in, `@root` the data itself, `../` an item further out
const target = (stack: Shape[], written: string): { from: Shape; path: string[] } | undefined => {
  const parsed = parseTemplatePath(written)
  if (!parsed) return undefined
  if (parsed.kind === 'data') return parsed.variable === 'root' ? { from: stack[0]!, path: parsed.names } : undefined
  return { from: stack[Math.max(0, stack.length - 1 - parsed.up)]!, path: parsed.names }
}

const texts = (value: LayoutValue): string[] => {
  if (typeof value === 'string') return [value]
  if (Array.isArray(value)) return value.flatMap(texts)
  if (isLayoutNode(value)) return []
  if (typeof value === 'object' && value !== null) return Object.values(value).flatMap(texts)
  return []
}

const toSchema = (node: Shape): JsonSchema => {
  if (node.fields.size === 0) return node.list ? { type: 'array' } : {}
  const object = { type: 'object', properties: Object.fromEntries([...node.fields].map(([name, inner]) => [name, toSchema(inner)])), required: [...node.fields.keys()] }
  return node.list ? { type: 'array', items: object } : object
}

/** The JSON Schema of the data the trees read: each path they name, required, its type left open, a list's items under it. */
export const derivedSchema = (trees: readonly LayoutNode[]): JsonSchema => {
  const root = shape()
  const visit = (node: LayoutNode, stack: Shape[]) => {
    const read = (written: string, list = false) => {
      const found = target(stack, written)
      return found && found.path.length > 0 ? at(found.from, found.path, list) : undefined
    }
    for (const [name, value] of Object.entries(node.props)) {
      if (isLayoutNode(value)) visit(value, stack)
      else if (name === 'values' && typeof value === 'object' && value !== null) for (const inner of Object.values(value)) if (isLayoutNode(inner)) visit(inner, stack)
      if (name === 'components' && typeof value === 'object' && value !== null) for (const inner of Object.values(value)) if (isLayoutNode(inner)) visit(inner, stack)
      for (const text of texts(value)) for (const path of templatePlaceholders(text)) read(path)
    }
    if (!node.custom && (node.type === 'Show' || node.type === 'Match') && typeof node.props.when === 'string') {
      const parsed = parseCondition(node.props.when.replace(/\{\{[^}]*\}\}/g, '""'))
      if (parsed.ok) for (const path of parsed.paths) read(path)
    }
    if (!node.custom && typeof node.props.source === 'string' && node.type !== 'ArrayField') read(node.props.source)
    let inner = stack
    if (!node.custom && node.type === 'ArrayField' && typeof node.props.source === 'string') {
      const list = read(node.props.source, true)
      if (list) inner = [...stack, list]
    }
    for (const child of [...node.children, ...(node.fallback ?? [])]) {
      if (typeof child !== 'string') visit(child, inner)
      else for (const path of templatePlaceholders(child)) {
        const found = target(inner, path)
        if (found && found.path.length > 0) at(found.from, found.path)
      }
    }
  }
  for (const tree of trees) visit(tree, [root])
  return toSchema(root)
}
