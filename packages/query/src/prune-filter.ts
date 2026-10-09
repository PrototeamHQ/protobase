import type { CheckedFilter } from '@protobase/schema'

/** Removes every condition on `field`, dropping groups that end up empty (disjunctive faceting). Text search stays. */
export const withoutField = (node: CheckedFilter | undefined, field: string): CheckedFilter | undefined => {
  if (!node) return undefined
  switch (node.kind) {
    case 'and':
    case 'or': {
      const args = node.args.map(arg => withoutField(arg, field)).filter(arg => arg !== undefined)
      return args.length === 0 ? undefined : { ...node, args }
    }
    case 'not': {
      const arg = withoutField(node.arg, field)
      return arg && { ...node, arg }
    }
    case 'search':
      return node
    default:
      return node.field.name === field ? undefined : node
  }
}
