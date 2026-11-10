import { maybe, type CompareOp, type Condition, type Scalar } from './condition'

/** A node of Postgres's parse tree, as the parser gives it in JSON: `{ NodeType: { ...fields } }`. */
export type AstNode = Record<string, any>

/** Which table a column of an expression belongs to: its name for the table read, `undefined` for any other. */
export type ColumnOwner = (fields: string[]) => string | undefined

const flipped: Record<CompareOp, CompareOp> = { '=': '=', '<>': '<>', '<': '>', '<=': '>=', '>': '<', '>=': '<=' }
const operators: Record<string, CompareOp> = { '=': '=', '<>': '<>', '!=': '<>', '<': '<', '<=': '<=', '>': '>', '>=': '>=' }

/** A query's parameter as a condition compares it; `undefined` for a value it cannot, such as bytes or an object. */
export const scalarOf = (value: unknown): Scalar | undefined => {
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value
  if (typeof value === 'bigint') return String(value)
  if (value instanceof Date) return value.toISOString()
  return undefined
}

// The parser leaves a field at its default out: an `ival` of 0 is `{}`, a `boolval` of false too.
const constant = (node: AstNode): Scalar | undefined => {
  if (node.isnull) return null
  if (node.ival) return node.ival.ival ?? 0
  if (node.fval) return node.fval.fval
  if (node.sval) return node.sval.sval ?? ''
  if (node.boolval) return node.boolval.boolval ?? false
  return undefined
}

/** The value of a constant or parameter, through casts; `undefined` for any other expression. */
const valueOf = (node: AstNode | undefined, params: readonly unknown[]): Scalar | undefined => {
  if (!node) return undefined
  if (node.TypeCast) return valueOf(node.TypeCast.arg, params)
  if (node.A_Const) return constant(node.A_Const)
  if (node.ParamRef) return scalarOf(params[node.ParamRef.number - 1])
  return undefined
}

/** The values of a list, an `ARRAY[...]` or an array parameter; `undefined` unless every one is known. */
const valuesOf = (node: AstNode | undefined, params: readonly unknown[]): Scalar[] | undefined => {
  if (!node) return undefined
  if (node.TypeCast) return valuesOf(node.TypeCast.arg, params)
  const items = node.List?.items ?? node.A_ArrayExpr?.elements
  const values: (Scalar | undefined)[] | undefined = items ? items.map((item: AstNode) => valueOf(item, params)) : node.ParamRef && Array.isArray(params[node.ParamRef.number - 1]) ? (params[node.ParamRef.number - 1] as unknown[]).map(scalarOf) : undefined
  return values && values.every((value) => value !== undefined) ? (values as Scalar[]) : undefined
}

const columnOf = (node: AstNode | undefined, owner: ColumnOwner) => {
  const ref = node?.TypeCast ? node.TypeCast.arg?.ColumnRef : node?.ColumnRef
  if (!ref || ref.fields.some((field: AstNode) => !field.String)) return undefined
  return owner(ref.fields.map((field: AstNode) => field.String.sval))
}

// `column op value`, either way round.
const comparison = (expr: AstNode, op: CompareOp, owner: ColumnOwner, params: readonly unknown[]): Condition => {
  const left = columnOf(expr.lexpr, owner)
  const right = valueOf(expr.rexpr, params)
  if (left !== undefined && right !== undefined) return { field: left, op, value: right }
  const column = columnOf(expr.rexpr, owner)
  const value = valueOf(expr.lexpr, params)
  if (column !== undefined && value !== undefined) return { field: column, op: flipped[op], value }
  return maybe
}

const aExpr = (expr: AstNode, owner: ColumnOwner, params: readonly unknown[]): Condition => {
  const name = expr.name?.[0]?.String?.sval as string | undefined
  const op = name === undefined ? undefined : operators[name]
  if (expr.kind === 'AEXPR_OP' && op) return comparison(expr, op, owner, params)
  const column = columnOf(expr.lexpr, owner)
  if (column === undefined) return maybe
  if (expr.kind === 'AEXPR_IN' || (expr.kind === 'AEXPR_OP_ANY' && name === '=')) {
    const values = valuesOf(expr.rexpr, params)
    if (!values) return maybe
    return name === '<>' ? { not: { field: column, op: 'in', values } } : { field: column, op: 'in', values }
  }
  if (expr.kind === 'AEXPR_BETWEEN') {
    const [low, high] = valuesOf(expr.rexpr, params) ?? []
    if (low === undefined || high === undefined) return maybe
    return { and: [{ field: column, op: '>=', value: low }, { field: column, op: '<=', value: high }] }
  }
  return maybe
}

/**
 * The condition an expression of a query's `WHERE` or `ON` sets on one table's rows: comparisons of that table's
 * columns with constants and parameters, `IN`, `= ANY`, `BETWEEN` and null tests, combined with `AND`, `OR` and `NOT`.
 * Anything else, a column of another table among them, is `maybe`.
 */
export const conditionOf = (expr: AstNode | undefined, owner: ColumnOwner, params: readonly unknown[]): Condition => {
  if (!expr) return maybe
  if (expr.BoolExpr) {
    const parts = (expr.BoolExpr.args as AstNode[]).map((arg) => conditionOf(arg, owner, params))
    if (expr.BoolExpr.boolop === 'AND_EXPR') return { and: parts }
    if (expr.BoolExpr.boolop === 'OR_EXPR') return { or: parts }
    return { not: parts[0]! }
  }
  if (expr.A_Expr) return aExpr(expr.A_Expr, owner, params)
  if (expr.NullTest) {
    const column = columnOf(expr.NullTest.arg, owner)
    return column === undefined ? maybe : { field: column, op: expr.NullTest.nulltesttype === 'IS_NULL' ? 'null' : 'notNull' }
  }
  // A boolean column on its own: `where done`.
  const column = columnOf(expr, owner)
  return column === undefined ? maybe : { field: column, op: '=', value: true }
}

/** The parts of an expression `AND` joins, so each can be weighed alone. */
export const conjuncts = (expr: AstNode | undefined): AstNode[] => {
  if (!expr) return []
  if (expr.BoolExpr?.boolop === 'AND_EXPR') return (expr.BoolExpr.args as AstNode[]).flatMap(conjuncts)
  return [expr]
}
