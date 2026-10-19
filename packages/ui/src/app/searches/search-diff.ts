import { createWhere, parseFilter, printFilter, type FilterExpr } from '@protobase/schema'
import type { FilterChip } from '../../filter-panel'
import { text } from './messages'

const where = createWhere()
const span = { start: 0, end: 0 }

type Atom = Extract<FilterExpr, { kind: 'compare' | 'in' | 'has' | 'similar' | 'regex' }>

// A condition on a field the record may have no value for: unknown then, as SQL's NULL, unless the field is present.
const guarded = (atom: Atom, condition: FilterExpr) => where.and(condition, { kind: 'present', field: atom.field, span })

/**
 * The filter that holds exactly where `expr` holds, and fails, never unknown, everywhere else. The database compares a
 * field without a value to unknown, and `NOT` of unknown is unknown too, so `NOT expr` alone would leave out every
 * record `expr` cannot decide, where `NOT surely(expr)` takes them in.
 */
const surely = (expr: FilterExpr): FilterExpr => {
  switch (expr.kind) {
    case 'and':
    case 'or':
      return { ...expr, args: expr.args.map(surely) }
    case 'not':
      return surelyNot(expr.arg)
    case 'search':
    case 'present':
    case 'isNull':
      return expr
    default:
      return guarded(expr, expr)
  }
}

/** The filter that holds exactly where `expr` fails, and fails, never unknown, everywhere else. */
const surelyNot = (expr: FilterExpr): FilterExpr => {
  switch (expr.kind) {
    case 'and':
      return where.or(...expr.args.map(surelyNot))
    case 'or':
      return where.and(...expr.args.map(surelyNot))
    case 'not':
      return surely(expr.arg)
    case 'search':
    case 'present':
    case 'isNull':
      return where.not(expr)
    default:
      return guarded(expr, where.not(expr))
  }
}

// A filter's text as parsed; an empty one is no condition, which every record meets.
const read = (text: string) => {
  const parsed = parseFilter(text)
  if (!parsed.ok) throw new Error(`The filter cannot be read: ${parsed.errors.map((error) => error.message).join('; ')}`)
  return parsed.ast
}

/**
 * The filter of the records `after` finds and `before` does not, for the list API: `after AND NOT before`, with a record
 * `before` cannot decide (a range on a field it has no value for) counted as not found by it. `null` when no record can
 * be among them, as when `before` is empty and so finds every record.
 */
export const addedFilter = (before: string, after: string): string | null => {
  const old = read(before)
  if (!old) return null
  const next = read(after)
  const notOld = where.not(surely(old))
  return printFilter(next ? where.and(next, notOld) : notOld)
}

/** The filter of the records `before` finds and `after` no longer does; `null` when none can be. */
export const removedFilter = (before: string, after: string) => addedFilter(after, before)

/** How a filter changes, chip by chip: one added, one removed, or one that holds another value (a range moved). */
export type FilterChange = { kind: 'added' | 'removed'; label: string } | { kind: 'changed'; label: string; before: string }

// A chip's identity across two filters: a widget's chip by its key, a condition no widget holds (`extra:<index>`) by
// what it says, as its index shifts with the conditions around it.
const identity = (chip: FilterChip) => (chip.key.startsWith('extra:') ? `extra:${chip.label}` : chip.key)

/** The chips that differ between two filters' chips: those removed, then those changed, then those added. */
export const filterChanges = (before: readonly FilterChip[], after: readonly FilterChip[]): FilterChange[] => {
  const old = new Map(before.map((chip) => [identity(chip), chip]))
  const next = new Map(after.map((chip) => [identity(chip), chip]))
  const removed = before.filter((chip) => !next.has(identity(chip))).map((chip): FilterChange => ({ kind: 'removed', label: chip.label }))
  const changed = after.flatMap((chip): FilterChange[] => {
    const was = old.get(identity(chip))
    return was && was.label !== chip.label ? [{ kind: 'changed', label: chip.label, before: was.label }] : []
  })
  const added = after.filter((chip) => !old.has(identity(chip))).map((chip): FilterChange => ({ kind: 'added', label: chip.label }))
  return [...removed, ...changed, ...added]
}

/** The net change in the records a search finds: "5 more homes", "1 fewer home" or "As many homes". */
export const netChange = (added: number, removed: number, singular: string, plural: string) => {
  const net = added - removed
  if (net === 0) return text('asMany', plural)
  const noun = Math.abs(net) === 1 ? singular : plural
  return net > 0 ? text('more', net, noun) : text('fewer', -net, noun)
}
