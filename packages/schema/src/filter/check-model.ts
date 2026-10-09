import type {
  CheckedFilter, CompareOp, FieldModel, FieldPath, FilterError, FilterExpr, FilterValue, Literal, ResourceModel, Span,
} from '../model'
import { checkValue } from './check-value'
import { resolveField, type CheckContext } from './check-field'
import { filterError } from './errors'
import { compareOps, isOpaque } from './operators'

const value = (ctx: CheckContext, field: FieldModel, node: FilterValue) => {
  const problem = checkValue(field, node)
  if (problem) ctx.errors.push(filterError('invalid-value', problem.message, problem.hint, node.span))
  return !problem
}

const operatorError = (ctx: CheckContext, message: string, hint: string, span: Span) => {
  ctx.errors.push(filterError('operator-not-allowed', message, hint, span))
}

const isWildcard = (op: CompareOp, node: FilterValue) =>
  (op === '=' || op === '!=') && node.kind === 'string' && node.value.includes('*')

const checkCompare = (ctx: CheckContext, node: Extract<FilterExpr, { kind: 'compare' }>) => {
  const field = resolveField(ctx, node.field, 'filterable')
  if (!field) return undefined
  const allowed = compareOps(field.type)
  if (!allowed.includes(node.op)) {
    operatorError(
      ctx,
      `Operator "${node.op}" is not supported for ${field.type} fields`,
      allowed.length ? `Supported: ${allowed.join(' ')}` : 'Use field:value on json fields, or isNull(field)',
      node.span,
    )
    return undefined
  }
  if (isWildcard(node.op, node.value) && field.type !== 'text') {
    ctx.errors.push(
      filterError('wildcard-not-allowed', `Wildcards are only supported on text fields, not ${field.type}`, 'Remove the "*" or filter a text field', node.value.span),
    )
    return undefined
  }
  if (!isWildcard(node.op, node.value) && !value(ctx, field, node.value)) return undefined
  return { ...node, field }
}

const checkHas = (ctx: CheckContext, node: Extract<FilterExpr, { kind: 'has' }>) => {
  const field = resolveField(ctx, node.field, 'filterable')
  if (!field) return undefined
  if (field.type !== 'json') {
    operatorError(ctx, `":" is only supported on json fields, not ${field.type}`, `Use = on ${field.type} fields, or field:* to test for a value`, node.span)
    return undefined
  }
  return { ...node, field }
}

const checkIn = (ctx: CheckContext, node: Extract<FilterExpr, { kind: 'in' }>) => {
  const field = resolveField(ctx, node.field, 'filterable')
  if (!field) return undefined
  if (isOpaque(field.type)) {
    operatorError(ctx, `in() is not supported for ${field.type} fields`, 'Use field:value on json fields', node.span)
    return undefined
  }
  const valid = node.values.map((literal: Literal) => value(ctx, field, literal))
  return valid.every(Boolean) ? { ...node, field } : undefined
}

const checkText = (ctx: CheckContext, name: string, path: FieldPath) => {
  const field = resolveField(ctx, path, 'filterable')
  if (field && field.type !== 'text') {
    operatorError(ctx, `${name}() only works on text fields, not ${field.type}`, `Field "${field.name}" is ${field.type}`, path.span)
    return undefined
  }
  return field
}

const checkNode = (ctx: CheckContext, node: FilterExpr): CheckedFilter | undefined => {
  switch (node.kind) {
    case 'and':
    case 'or': {
      const args = node.args.map((arg) => checkNode(ctx, arg))
      return args.every((arg) => arg) ? { ...node, args: args as CheckedFilter[] } : undefined
    }
    case 'not': {
      const arg = checkNode(ctx, node.arg)
      return arg && { ...node, arg }
    }
    case 'compare':
      return checkCompare(ctx, node)
    case 'has':
      return checkHas(ctx, node)
    case 'in':
      return checkIn(ctx, node)
    case 'search':
      if (ctx.model.search?.length) return node
      ctx.errors.push(filterError('no-search-fields', 'This resource has no search fields', 'Declare them with .search((r) => [r.title]) in data.ts', node.span))
      return undefined
    case 'present':
    case 'isNull': {
      const field = resolveField(ctx, node.field, 'filterable')
      return field && { ...node, field }
    }
    case 'similar':
    case 'regex': {
      const field = checkText(ctx, node.kind, node.field)
      return field && { ...node, field }
    }
  }
}

export const checkAgainstModel = (model: ResourceModel, ast: FilterExpr) => {
  const ctx: CheckContext = { model, errors: [] }
  const filter = checkNode(ctx, ast)
  if (!filter || ctx.errors.length > 0) {
    return { ok: false, errors: [...ctx.errors].sort((a, b) => a.span.start - b.span.start) } as const
  }
  return { ok: true, filter } as const
}
