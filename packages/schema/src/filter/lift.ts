import type { Expr as Generic, Operand } from 'aip-parsers/filter'
import type { CheckedFilter, FieldModel, FieldPath, FilterExpr, FilterOf, FilterValue, Literal } from '../model'
import { libraryType } from './profile'

type Field = FieldPath | FieldModel
type Node = FilterOf<Field>

// Checked fields carry their type, so the evaluator converts quoted values by it.
const member = (field: Field, span: Node['span']): Operand =>
  'path' in field
    ? { kind: 'member', path: field.path, span: field.span }
    : { kind: 'member', path: [field.name], field: { name: field.name, spec: { type: libraryType(field) } }, span }

const call = (name: string, args: Operand[], span: Node['span']): Generic => ({ kind: 'call', name, args, span })

const text = (value: string, span: Node['span']): Operand => ({ kind: 'string', value, span })

const value = (node: FilterValue): Operand => {
  if (node.kind !== 'now') return node
  const now: Operand = { kind: 'call', name: 'now', args: [], span: node.span }
  if (!node.offset) return now
  return { kind: 'binary', op: node.offset.sign, left: now, right: node.offset.duration, span: node.span }
}

export type LiftOptions = {
  /** Rewrite `in` and `isNull` into plain comparisons and presence, for evaluation. */
  expand?: boolean
}

/** Protobase's filter shape as a generic AIP-160 expression, for checking, printing and evaluating. */
export const lift = (node: Node, options: LiftOptions = {}): Generic => {
  const next = (child: Node) => lift(child, options)
  switch (node.kind) {
    case 'and':
    case 'or':
      return { kind: node.kind, args: node.args.map(next), span: node.span }
    case 'not':
      return { kind: 'not', arg: next(node.arg), span: node.span }
    case 'compare':
      return { kind: 'compare', op: node.op, left: member(node.field, node.span), right: value(node.value), span: node.span }
    case 'has':
      return { kind: 'has', left: member(node.field, node.span), right: node.value, span: node.span }
    case 'present':
      return { kind: 'present', left: member(node.field, node.span), span: node.span }
    case 'in':
      if (options.expand) {
        const args = node.values.map((literal): Generic => ({ kind: 'compare', op: '=', left: member(node.field, node.span), right: literal, span: node.span }))
        return { kind: 'or', args, span: node.span }
      }
      return call('in', [member(node.field, node.span), ...node.values], node.span)
    case 'search':
      return call('search', [text(node.text, node.span)], node.span)
    case 'similar':
      return call('similar', [member(node.field, node.span), text(node.text, node.span)], node.span)
    case 'regex':
      return call('regex', [member(node.field, node.span), text(node.pattern, node.span)], node.span)
    case 'isNull':
      if (options.expand) return { kind: 'not', arg: { kind: 'present', left: member(node.field, node.span), span: node.span }, span: node.span }
      return call('isNull', [member(node.field, node.span)], node.span)
  }
}

export type { CheckedFilter, FilterExpr, Literal }
