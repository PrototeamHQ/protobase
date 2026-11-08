import { parseFilter, printFilter, type FilterExpr, type ResourceModel } from '@protobase/schema'

/**
 * A time term of `when`: `<field> <= now() - <duration>`, ready once the field's time plus `afterMs` has come; a strict
 * `<` is ready a millisecond later, once the comparison holds.
 */
export type TimeTerm = { field: string; afterMs: number }

/** `when` split for a ready trigger: the filter without its time terms, and the time terms the start waits for. */
export type ReadyWhen = { filter: FilterExpr | undefined; timeTerms: TimeTerm[] }

const unitMs = { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000, w: 604_800_000 }

/** The longest wait a time term may say, 100 years, so a ready time stays a date JavaScript can hold. */
export const maxAfterMs = 100 * 365 * 86_400_000

const usesNow = (node: unknown): boolean => {
  if (typeof node !== 'object' || node === null) return false
  if ((node as { kind?: unknown }).kind === 'now') return true
  return Object.values(node).some(usesNow)
}

// `<field> <= now()` or `<field> < now() - <duration>`: a time the record becomes ready at, read off the term.
const timeTerm = (term: FilterExpr): TimeTerm | undefined => {
  if (term.kind !== 'compare' || (term.op !== '<=' && term.op !== '<') || term.value.kind !== 'now' || term.field.path.length !== 1) return
  const offset = term.value.offset
  if (offset && offset.sign !== '-') return
  const afterMs = (offset ? offset.duration.amount * unitMs[offset.duration.unit] : 0) + (term.op === '<' ? 1 : 0)
  return { field: term.field.path[0]!, afterMs }
}

/**
 * Splits a ready trigger's `when`: `now()` may stand only in top-level AND terms of the form `<timestamp field> <=
 * now() - <duration>` (or `<`), which say when a record becomes ready, so the start waits until then and nothing sweeps.
 * Any other use of `now()` is refused, naming the term.
 */
export const readyWhen = (when: string | undefined): { ok: true; when: ReadyWhen } | { ok: false; problems: string[] } => {
  if (when === undefined) return { ok: true, when: { filter: undefined, timeTerms: [] } }
  const parsed = parseFilter(when)
  if (!parsed.ok) return { ok: false, problems: parsed.errors.map((error) => error.message) }
  if (!parsed.ast) return { ok: true, when: { filter: undefined, timeTerms: [] } }
  const terms = parsed.ast.kind === 'and' ? parsed.ast.args : [parsed.ast]
  const timeTerms: TimeTerm[] = []
  const rest: FilterExpr[] = []
  const problems: string[] = []
  for (const term of terms) {
    const time = timeTerm(term)
    if (time && time.afterMs > maxAfterMs) problems.push(`"${printFilter(term)}" waits longer than 100 years`)
    else if (time) timeTerms.push(time)
    else if (usesNow(term)) problems.push(`"${printFilter(term)}" uses now() other than as <timestamp field> <= now() - <duration> joined by AND`)
    else rest.push(term)
  }
  if (problems.length > 0) return { ok: false, problems }
  const filter = rest.length === 0 ? undefined : rest.length === 1 ? rest[0]! : { kind: 'and' as const, args: rest, span: parsed.ast.span }
  return { ok: true, when: { filter, timeTerms } }
}

/** When a record becomes ready by its time terms: the latest of them, now when it has none, undefined when a time is unset. */
export const readyAt = (timeTerms: readonly TimeTerm[], record: Record<string, unknown>, now: Date) => {
  let at = now.getTime()
  for (const { field, afterMs } of timeTerms) {
    const value = record[field]
    if (value === null || value === undefined) return
    const time = new Date(value as string).getTime()
    if (Number.isNaN(time)) return
    at = Math.max(at, time + afterMs)
  }
  const ready = new Date(at)
  if (Number.isNaN(ready.getTime())) return
  return ready
}

/** The field a time term names, by its name or one of its aliases, as the record read carries it. */
export const timeField = (model: ResourceModel, name: string) => Object.values(model.fields).find((field) => field.name === name || field.aliases.includes(name))

/** The time terms with each field named as the record carries it; a term on no field of the model keeps its name. */
export const resolveTimeTerms = (model: ResourceModel, terms: readonly TimeTerm[]) => terms.map((term) => ({ ...term, field: timeField(model, term.field)?.name ?? term.field }))
