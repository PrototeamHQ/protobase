import { evaluateFilter, parseFilter, type Arg, type Call, type Expr, type Literal } from 'aip-parsers/filter'

// `<Show when="...">` conditions: AIP-160 text over named values, such as `status = 'active'` (a field of the record
// around it), `plan.name = "Pro"` (through a relation) or `billing_profiles.count > 1` (how many records a resource has).

export type Condition = { ast: Expr | undefined; paths: string[] }

export type ConditionParse = ({ ok: true } & Condition) | { ok: false; message: string }

type Member = { kind: 'member'; path: string[] }

const isMember = (node: unknown): node is Member => typeof node === 'object' && node !== null && (node as Member).kind === 'member'

// Every value the condition names, as a dotted path. Spans and literals hold no members, so a plain walk is enough.
const memberPaths = (node: unknown): string[] => {
  if (isMember(node)) return [node.path.join('.')]
  if (typeof node !== 'object' || node === null) return []
  return Object.values(node).flatMap(memberPaths)
}

// The same tree with each member path folded into one name, so it reads `values['plan.name']` and never walks into a
// value: `plan` (a key) and `plan.name` (a field of that record) can both be named.
const folded = (node: unknown): unknown => {
  if (isMember(node)) return { ...node, path: [node.path.join('.')] }
  if (Array.isArray(node)) return node.map(folded)
  if (typeof node !== 'object' || node === null) return node
  return Object.fromEntries(Object.entries(node).map(([key, value]) => [key, folded(value)]))
}

const literalKinds = new Set(['string', 'number', 'boolean', 'duration', 'timestamp'])

const isLiteral = (node: Arg): node is Literal => literalKinds.has(node.kind)

// The functions a condition may call, rewritten into what the evaluator has itself, as filters on records are:
// `isNull(field)` into `NOT field:*`, `in(field, a, b)` into `field = a OR field = b`. Any other call is left alone.
const expandedCall = (node: Call): Expr | undefined => {
  const [first, ...rest] = node.args
  if (!first || !isMember(first)) return
  if (node.name === 'isNull' && rest.length === 0) return { kind: 'not', arg: { kind: 'present', left: first, span: node.span }, span: node.span }
  if (node.name !== 'in' || rest.length === 0 || !rest.every(isLiteral)) return
  return { kind: 'or', args: rest.map((value): Expr => ({ kind: 'compare', op: '=', left: first, right: value, span: node.span })), span: node.span }
}

const expanded = (node: unknown): unknown => {
  if (Array.isArray(node)) return node.map(expanded)
  if (typeof node !== 'object' || node === null) return node
  const call = (node as Call).kind === 'call' ? expandedCall(node as Call) : undefined
  if (call) return call
  return Object.fromEntries(Object.entries(node).map(([key, value]) => [key, expanded(value)]))
}

export const parseCondition = (source: string): ConditionParse => {
  const parsed = parseFilter(source)
  if (!parsed.ok) return { ok: false, message: parsed.errors.map((error) => error.message).join('; ') }
  if (!parsed.ast) return { ok: false, message: 'the condition is empty' }
  return { ok: true, ast: parsed.ast, paths: [...new Set(memberPaths(parsed.ast))] }
}

/** True when the condition holds for `values`, keyed by the dotted paths in `condition.paths`. <gap>A condition cannot call functions other than isNull and in, such as now(), because their evaluation is not implemented.</gap> */
export const evaluateCondition = (condition: Condition, values: Record<string, unknown>) =>
  condition.ast !== undefined && evaluateFilter(folded(expanded(condition.ast)) as Expr, values)

/** The resource a path counts (`billing_profiles.count`), when it is not a field of the record around it. */
export const countedResource = (path: string, isField: (name: string) => boolean): string | undefined => {
  const [first, second, ...rest] = path.split('.')
  return first && second === 'count' && rest.length === 0 && !isField(first) ? first : undefined
}
