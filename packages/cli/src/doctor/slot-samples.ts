import { parseFilter, type FieldModel, type FilterExpr, type Literal, type ResourceModel } from '@protobase/schema'

// A plan's `{{path}}` slots are the address's values, which the index rule reads only as values: each stands in as a
// value its field takes, so the filter checks as the API checks it once the address fills the slot.

const sentinel = '__pb_doctor_slot__'
const span = { start: 0, end: 0 }

const text = (value: string): Literal => ({ kind: 'string', value, span })

const sampleFor = (field: FieldModel | undefined): Literal => {
  switch (field?.type) {
    case 'integer':
    case 'bigint':
    case 'decimal':
      return { kind: 'number', value: 0, raw: '0', span }
    case 'boolean':
      return { kind: 'boolean', value: true, span }
    case 'enum':
      return text(field.enumValues?.[0] ?? 'x')
    case 'timestamp':
      return { kind: 'timestamp', value: '2000-01-01T00:00:00Z', span } as Literal
    case 'date':
      return text('2000-01-01')
    case 'uuid':
      return text('00000000-0000-0000-0000-000000000000')
    case 'currency':
      return text('EUR')
    case 'country':
      return text('NL')
    default:
      return text('x')
  }
}

const isSlot = (value: unknown) => typeof value === 'object' && value !== null && (value as Literal).kind === 'string' && (value as { value?: unknown }).value === sentinel

const fieldOf = (model: ResourceModel, path: readonly string[]) => (path.length === 1 ? model.fields[path[0]!] : undefined)

/** `ast` with each slot's stand-in replaced by a value its field takes in `model`; `related()` terms are left as they are. */
export const fitSlots = (ast: FilterExpr, model: ResourceModel): FilterExpr => {
  switch (ast.kind) {
    case 'and':
    case 'or':
      return { ...ast, args: ast.args.map((arg) => fitSlots(arg, model)) }
    case 'not':
      return { ...ast, arg: fitSlots(ast.arg, model) }
    case 'compare':
      return isSlot(ast.value) && ast.field.kind === 'field' ? { ...ast, value: sampleFor(fieldOf(model, ast.field.path)) } : ast
    case 'in':
      return ast.field.kind === 'field' ? { ...ast, values: ast.values.map((value) => (isSlot(value) ? sampleFor(fieldOf(model, (ast.field as { path: string[] }).path)) : value)) } : ast
    default:
      return ast
  }
}

/** A planned filter parsed with a stand-in for each slot, a duration after `+` or `-`; `undefined` when it has none. */
export const parseSampled = (filter: string | undefined): FilterExpr | undefined => {
  if (filter === undefined) return
  const sampled = filter.replace(/"\{\{[^{}]*\}\}"/g, `"${sentinel}"`).replace(/([-+]\s*)\{\{[^{}]*\}\}/g, '$11d').replace(/\{\{[^{}]*\}\}/g, `"${sentinel}"`)
  const result = parseFilter(sampled)
  if (!result.ok) throw new Error(`The planned filter "${filter}" does not parse: ${result.errors[0]!.message}`)
  return result.ast
}
