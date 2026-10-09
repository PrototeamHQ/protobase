import { evaluateFilter, parseFilter, type Expr } from 'aip-parsers/filter'

// `<Show when="...">` conditions: AIP-160 text over named values, such as `status = 'active'` (a field of the record
// around it), `plan.name = "Pro"` (through a relation) or `billingProfiles.count > 1` (how many records a resource has).

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

export const parseCondition = (source: string): ConditionParse => {
  const parsed = parseFilter(source)
  if (!parsed.ok) return { ok: false, message: parsed.errors.map((error) => error.message).join('; ') }
  if (!parsed.ast) return { ok: false, message: 'the condition is empty' }
  return { ok: true, ast: parsed.ast, paths: [...new Set(memberPaths(parsed.ast))] }
}

/** True when the condition holds for `values`, keyed by the dotted paths in `condition.paths`. Functions are not supported. */
export const evaluateCondition = (condition: Condition, values: Record<string, unknown>) =>
  condition.ast !== undefined && evaluateFilter(folded(condition.ast) as Expr, values)

/** The resource a path counts (`billingProfiles.count`), when it is not a field of the record around it. */
export const countedResource = (path: string, isField: (name: string) => boolean): string | undefined => {
  const [first, second, ...rest] = path.split('.')
  return first && second === 'count' && rest.length === 0 && !isField(first) ? first : undefined
}
