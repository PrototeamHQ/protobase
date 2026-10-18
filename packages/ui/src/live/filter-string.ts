import { createWhere, parseFilter, printFilter, type FilterError, type FilterExpr } from '@protobase/schema'
import type { DatePresetId, FilterConfig, FilterState } from '../filter-panel'
import { dayIn, startOfDayIn, viewerZone } from '../format/zone'

const w = createWhere()
const span = { start: 0, end: 0 }

/** The widgets a `FilterConfig` talks to, by field name. */
type Fields = Pick<FilterConfig, 'facets' | 'ranges' | 'dateField' | 'dateKind' | 'toggles'>

const relative = { '7d': { amount: 7, unit: 'd' }, '30d': { amount: 30, unit: 'd' }, '90d': { amount: 90, unit: 'd' } } as const

const iso = (ms: number) => new Date(ms).toISOString().replace('.000Z', 'Z')

/** The first day of the period a calendar preset starts at, as `YYYY-MM-DD` on the clock of `zone`. */
export const periodStart = (preset: DatePresetId, now: Date, zone: string) => {
  const today = dayIn(now.getTime(), zone)
  const [year, month] = [Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1]
  const day = (ms: number) => new Date(ms).toISOString().slice(0, 10)
  if (preset === 'year') return day(Date.UTC(year, 0, 1))
  if (preset === 'quarter') return day(Date.UTC(year, Math.floor(month / 3) * 3, 1))
  if (preset === 'month') return day(Date.UTC(year, month, 1))
  if (preset === 'yesterday') return day(Date.parse(`${today}T00:00:00Z`) - 86_400_000)
  return today
}

const calendarPresets: DatePresetId[] = ['year', 'quarter', 'month', 'yesterday', 'today']

/** The literal a day starts at: the plain date for a date field, its first instant in `zone` for a timestamp field. */
const dayLiteral = (day: string, kind: Fields['dateKind'], zone: string) => (kind === 'date' ? day : iso(startOfDayIn(day, zone)))

const instant = (day: string, kind: Fields['dateKind'], zone: string) =>
  kind === 'date' ? { kind: 'string' as const, value: dayLiteral(day, kind, zone), span } : { kind: 'timestamp' as const, value: dayLiteral(day, kind, zone), span }

const dateClauses = (field: string, preset: DatePresetId, now: Date, kind: Fields['dateKind'], zone: string): FilterExpr[] => {
  if (preset in relative) return [w.gte(field, w.ago(preset))]
  const from = w.gte(field, instant(periodStart(preset, now, zone), kind, zone))
  return preset === 'yesterday' ? [from, w.lt(field, instant(periodStart('today', now, zone), kind, zone))] : [from]
}

/** The panel's state as filter clauses, in a fixed order so the text is stable; calendar presets start at midnight in `zone`. */
export const stateToClauses = (config: Fields, state: FilterState, now = new Date(), zone = viewerZone()): FilterExpr[] => {
  const facets = config.facets.flatMap((group) => {
    const values = state.facets[group.id] ?? []
    if (values.length === 0) return []
    if (group.flags) {
      const chosen = group.options.filter((option) => values.includes(option.value)).map((option) => w.eq(option.value, true))
      return chosen.length === 0 ? [] : [chosen.length === 1 ? chosen[0]! : w.or(...chosen)]
    }
    return [values.length === 1 ? w.eq(group.id, values[0]!) : w.in(group.id, values)]
  })
  const ranges = (config.ranges ?? []).flatMap((range) => {
    const span = state.ranges?.[range.id]
    return span ? [w.gte(range.id, span[0]), w.lte(range.id, span[1])] : []
  })
  const date = config.dateField && state.date ? dateClauses(config.dateField, state.date, now, config.dateKind, zone) : []
  const toggles = (config.toggles ?? []).filter((toggle) => state.toggles.includes(toggle.id)).map((toggle) => w.eq(toggle.id, true))
  return [...facets, ...ranges, ...date, ...toggles]
}

export const clausesToText = (clauses: FilterExpr[]) => (clauses.length === 0 ? '' : printFilter(w.and(...clauses)))

export const stateToText = (config: Fields, state: FilterState, extras: FilterExpr[] = [], now = new Date(), zone = viewerZone()) =>
  clausesToText([...stateToClauses(config, state, now, zone), ...extras])

const flatten = (expr: FilterExpr): FilterExpr[] => (expr.kind === 'and' ? expr.args.flatMap(flatten) : [expr])

const fieldName = (expr: { field: { path: string[] } }) => expr.field.path.join('.')

const isTrue = (expr: FilterExpr): expr is FilterExpr & { kind: 'compare' } => expr.kind === 'compare' && expr.op === '=' && expr.value.kind === 'boolean' && expr.value.value

// The flags group a clause chooses from, with the fields it chooses: `field = true`, or such clauses ORed in one group.
const flagsChosen = (clause: FilterExpr, groupOf: Map<string, string>) => {
  const parts = clause.kind === 'or' ? clause.args : [clause]
  if (!parts.every(isTrue)) return undefined
  const fields = parts.map(fieldName)
  const group = groupOf.get(fields[0]!)
  return group !== undefined && fields.every((field) => groupOf.get(field) === group) ? { group, fields } : undefined
}

const literalText = (value: { kind: string; value?: unknown; raw?: string }) => (value.kind === 'number' ? String(value.raw) : value.kind === 'string' ? String(value.value) : undefined)

const presetOf = (clause: FilterExpr & { kind: 'compare' }, now: Date, zone: string): DatePresetId | undefined => {
  const v = clause.value
  if (v.kind === 'now' && v.offset?.sign === '-') {
    const { amount, unit } = v.offset.duration
    return (Object.entries(relative) as Array<[DatePresetId, { amount: number; unit: string }]>).find(([, d]) => d.amount === amount && d.unit === unit)?.[0]
  }
  if (v.kind === 'timestamp') return calendarPresets.find((preset) => dayLiteral(periodStart(preset, now, zone), 'timestamp', zone) === v.value)
  if (v.kind === 'string') return calendarPresets.find((preset) => periodStart(preset, now, zone) === v.value)
  return undefined
}

export type ParsedFilter = { ok: true; state: FilterState; extras: FilterExpr[] } | { ok: false; errors: FilterError[] }

/**
 * The inverse of `stateToText`: clauses that match a widget fill the panel state, everything else
 * (search text, hand-written conditions) is returned as `extras` and survives the round trip.
 */
export const textToState = (config: Fields, text: string, now = new Date(), zone = viewerZone()): ParsedFilter => {
  const parsed = parseFilter(text)
  if (!parsed.ok) return { ok: false, errors: parsed.errors }
  const state: FilterState = { facets: {}, toggles: [] }
  const extras: FilterExpr[] = []
  const facetIds = new Set(config.facets.filter((group) => !group.flags).map((group) => group.id))
  const flagGroupOf = new Map(config.facets.filter((group) => group.flags).flatMap((group) => group.options.map((option) => [option.value, group.id] as const)))
  const toggleIds = new Set((config.toggles ?? []).map((toggle) => toggle.id))
  const rangeIds = new Set((config.ranges ?? []).map((range) => range.id))
  const bounds = new Map<string, { low?: number; high?: number; clauses: FilterExpr[] }>()
  let dateClause: FilterExpr | undefined
  let todayEnd: FilterExpr | undefined

  for (const clause of parsed.ast ? flatten(parsed.ast) : []) {
    const flags = flagsChosen(clause, flagGroupOf)
    if (flags && !state.facets[flags.group]) {
      state.facets[flags.group] = flags.fields
    } else if (clause.kind === 'compare' && facetIds.has(fieldName(clause)) && clause.op === '=' && literalText(clause.value) !== undefined) {
      state.facets[fieldName(clause)] = [...(state.facets[fieldName(clause)] ?? []), literalText(clause.value)!]
    } else if (clause.kind === 'in' && facetIds.has(fieldName(clause)) && clause.values.every((value) => literalText(value) !== undefined)) {
      state.facets[fieldName(clause)] = [...(state.facets[fieldName(clause)] ?? []), ...clause.values.map((value) => literalText(value)!)]
    } else if (clause.kind === 'compare' && config.dateField === fieldName(clause) && clause.op === '>=' && presetOf(clause, now, zone) && !state.date) {
      state.date = presetOf(clause, now, zone)
      dateClause = clause
    } else if (clause.kind === 'compare' && config.dateField === fieldName(clause) && clause.op === '<' && (clause.value.kind === 'timestamp' || clause.value.kind === 'string') && clause.value.value === dayLiteral(periodStart('today', now, zone), clause.value.kind === 'string' ? 'date' : 'timestamp', zone)) {
      todayEnd = clause
    } else if (clause.kind === 'compare' && toggleIds.has(fieldName(clause)) && clause.op === '=' && clause.value.kind === 'boolean' && clause.value.value) {
      state.toggles.push(fieldName(clause))
    } else if (clause.kind === 'compare' && rangeIds.has(fieldName(clause)) && (clause.op === '>=' || clause.op === '<=') && clause.value.kind === 'number') {
      const range = bounds.get(fieldName(clause)) ?? { clauses: [] }
      if (clause.op === '>=') range.low = clause.value.value
      else range.high = clause.value.value
      range.clauses.push(clause)
      bounds.set(fieldName(clause), range)
    } else {
      extras.push(clause)
    }
  }

  if (state.date === 'yesterday' && !todayEnd) {
    extras.push(dateClause!)
    state.date = undefined
  }
  if (todayEnd && state.date !== 'yesterday') extras.push(todayEnd)
  // A range takes a lower and an upper bound; one of them alone is a hand-written condition
  for (const [id, range] of bounds) {
    if (range.low !== undefined && range.high !== undefined) state.ranges = { ...state.ranges, [id]: [range.low, range.high] }
    else extras.push(...range.clauses)
  }
  return { ok: true, state, extras }
}
