import type { Arg, Call, Expr as Generic, Operand } from 'aip-parsers/filter'
import type { FieldPath, FilterError, FilterExpr, FilterValue, Literal, Span } from '../model'
import { filterError } from './errors'
import { functions } from './profile'

export type Lowering = { errors: FilterError[] }

const unsupported = (l: Lowering, message: string, hint: string, span: Span) => {
  l.errors.push(filterError('unsupported', message, hint, span))
  return undefined
}

const fieldOf = (l: Lowering, node: Operand): FieldPath | undefined =>
  node.kind === 'member'
    ? { kind: 'field', path: node.path, span: node.span }
    : unsupported(l, 'Only fields can be compared', 'Put a field name on the left, for example total > 100', node.span)

// Bare words on the right are text; now() with an optional duration offset is a NowValue.
const valueOf = (l: Lowering, node: Operand): FilterValue | undefined => {
  switch (node.kind) {
    case 'member':
      return { kind: 'string', value: node.path.join('.'), span: node.span }
    case 'call':
      if (node.name === 'now' && node.args.length === 0) return { kind: 'now', span: node.span }
      return unsupported(l, `${node.name}() cannot be used as a value`, 'Only now() is a value function', node.span)
    case 'binary': {
      const left = node.left
      const isNow = left.kind === 'call' && left.name === 'now' && left.args.length === 0
      if (isNow && node.right.kind === 'duration') {
        return { kind: 'now', offset: { sign: node.op, duration: node.right }, span: node.span }
      }
      return unsupported(l, 'Arithmetic is only supported as now() +/- duration', 'Write now() - 30d', node.span)
    }
    default:
      return node
  }
}

const literalOf = (l: Lowering, node: Arg): Literal | undefined => {
  const value = 'kind' in node && ['member', 'call', 'binary'].includes(node.kind) ? undefined : (node as Literal)
  if (value) return value
  if (node.kind === 'member') return { kind: 'string', value: node.path.join('.'), span: node.span }
  return unsupported(l, 'Expected a literal value', 'Use strings, numbers, true/false, durations or timestamps', node.span)
}

const wordOf = (node: Operand) => {
  switch (node.kind) {
    case 'member':
      return node.path.join('.')
    case 'string':
    case 'timestamp':
      return node.kind === 'string' ? node.value : node.value
    case 'number':
      return node.raw
    case 'boolean':
      return String(node.value)
    case 'duration':
      return `${node.amount}${node.unit}`
    default:
      return ''
  }
}

const lowerCall = (l: Lowering, node: Call): FilterExpr | undefined => {
  const [first, second, ...rest] = node.args
  const field = first?.kind === 'member' ? fieldOf(l, first) : undefined
  const string = (arg: Arg | undefined) => (arg?.kind === 'string' ? arg.value : undefined)
  const bad = (usage: string) => {
    l.errors.push(filterError('invalid-arguments', `Invalid arguments to ${node.name}()`, `Usage: ${usage}`, node.span))
    return undefined
  }
  switch (node.name) {
    case 'in': {
      const values = node.args.slice(1).map((arg) => literalOf(l, arg))
      if (!field || values.length === 0) return bad('in(field, value1, value2, ...)')
      return values.every((v) => v) ? { kind: 'in', field, values: values as Literal[], span: node.span } : undefined
    }
    case 'search':
      return string(first) !== undefined && !second ? { kind: 'search', text: string(first)!, span: node.span } : bad('search("text")')
    case 'similar':
      return field && string(second) !== undefined && rest.length === 0 ? { kind: 'similar', field, text: string(second)!, span: node.span } : bad('similar(field, "text")')
    case 'regex':
      return field && string(second) !== undefined && rest.length === 0 ? { kind: 'regex', field, pattern: string(second)!, span: node.span } : bad('regex(field, "pattern")')
    case 'isNull':
      return field && !second ? { kind: 'isNull', field, span: node.span } : bad('isNull(field)')
    default:
      l.errors.push(filterError('unknown-function', `Unknown function "${node.name}"`, `Available functions: ${Object.keys(functions).join(', ')}`, node.span))
      return undefined
  }
}

const all = (items: (FilterExpr | undefined)[]) => (items.every((item) => item) ? (items as FilterExpr[]) : undefined)

/** Lowers a generic AIP-160 expression to Protobase's filter shape; unsupported constructs become errors. */
export const lower = (l: Lowering, node: Generic): FilterExpr | undefined => {
  switch (node.kind) {
    case 'sequence':
    case 'and':
    case 'or': {
      const args = all(node.args.map((arg) => lower(l, arg)))
      return args && { kind: node.kind === 'or' ? 'or' : 'and', args, span: node.span }
    }
    case 'not': {
      const arg = lower(l, node.arg)
      return arg && { kind: 'not', arg, span: node.span }
    }
    case 'compare': {
      const field = fieldOf(l, node.left)
      const value = valueOf(l, node.right)
      return field && value && { kind: 'compare', op: node.op, field, value, span: node.span }
    }
    case 'has': {
      const field = fieldOf(l, node.left)
      const value = literalOf(l, node.right)
      return field && value && { kind: 'has', field, value, span: node.span }
    }
    case 'present': {
      const field = fieldOf(l, node.left)
      return field && { kind: 'present', field, span: node.span }
    }
    case 'global':
      return { kind: 'search', text: wordOf(node.value), span: node.span }
    case 'call':
      return lowerCall(l, node)
  }
}
