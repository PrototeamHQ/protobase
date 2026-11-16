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

// The functions a condition can evaluate against the values around it; any other, such as `regex()` or `related()`,
// only a list's filter, read by the API, can use
const evaluable = new Set(['isNull', 'in', 'now'])

const calls = (node: unknown): string[] => {
  if (Array.isArray(node)) return node.flatMap(calls)
  if (typeof node !== 'object' || node === null) return []
  const own = (node as Call).kind === 'call' ? [(node as Call).name] : []
  return [...own, ...Object.values(node).flatMap(calls)]
}

// As the API's filters read them, so `now() + 7d` is a time a week ahead
const parseOptions = { extensions: { arithmetic: 'now-offset' as const, durationUnits: true } }

export const parseCondition = (source: string): ConditionParse => {
  const parsed = parseFilter(source, parseOptions)
  if (!parsed.ok) return { ok: false, message: parsed.errors.map((error) => error.message).join('; ') }
  if (!parsed.ast) return { ok: false, message: 'the condition is empty' }
  const refused = calls(parsed.ast).find((name) => !evaluable.has(name))
  if (refused !== undefined) return { ok: false, message: `${refused}() only works in a list's filter, which the API reads; a condition can call isNull(), in() and now()` }
  return { ok: true, ast: parsed.ast, paths: [...new Set(memberPaths(parsed.ast))] }
}

const durationMs = { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000, w: 604_800_000 } as const

// `now()` and `now() ± <duration>` as the time they name, in the ISO form records give their times in
const timed = (node: unknown, at: number): unknown => {
  if (Array.isArray(node)) return node.map((item) => timed(item, at))
  if (typeof node !== 'object' || node === null) return node
  const call = node as { kind: string; name?: string; op?: string; left?: { kind: string; name?: string }; right?: { kind: string; amount?: number; unit?: keyof typeof durationMs } }
  if (call.kind === 'call' && call.name === 'now') return { kind: 'string', value: new Date(at).toISOString() }
  if (call.kind === 'binary' && call.left?.kind === 'call' && call.left.name === 'now' && call.right?.kind === 'duration') {
    const offset = (call.right.amount ?? 0) * durationMs[call.right.unit ?? 's']
    return { kind: 'string', value: new Date(call.op === '-' ? at - offset : at + offset).toISOString() }
  }
  return Object.fromEntries(Object.entries(node).map(([key, value]) => [key, timed(value, at)]))
}

/** True when the condition holds for `values`, keyed by the dotted paths in `condition.paths`; `now()` is the time `at`, the current one by default. */
export const evaluateCondition = (condition: Condition, values: Record<string, unknown>, at = Date.now()) =>
  condition.ast !== undefined && evaluateFilter(folded(expanded(timed(condition.ast, at))) as Expr, values)

/** The resource a path counts (`billing_profiles.count`), when it is not a field of the record around it. */
export const countedResource = (path: string, isField: (name: string) => boolean): string | undefined => {
  const [first, second, ...rest] = path.split('.')
  return first && second === 'count' && rest.length === 0 && !isField(first) ? first : undefined
}
