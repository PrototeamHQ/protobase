import { createWhere, parseFilter, printFilter, type FilterError, type FilterExpr } from '@protobase/schema'
import type { DatePresetId, FilterConfig, FilterState } from '../filter-panel'

const w = createWhere()
const span = { start: 0, end: 0 }

/** The widgets a `FilterConfig` talks to, by field name. */
type Fields = Pick<FilterConfig, 'facets' | 'range' | 'dateField' | 'dateKind' | 'toggles'>

const relative = { '7d': { amount: 7, unit: 'd' }, '30d': { amount: 30, unit: 'd' }, '90d': { amount: 90, unit: 'd' } } as const

const iso = (ms: number) => new Date(ms).toISOString().replace('.000Z', 'Z')

/** First instant of the period a calendar preset starts at, in UTC. */
export const periodStart = (preset: DatePresetId, now: Date) => {
  const [year, month, day] = [now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()]
  if (preset === 'year') return iso(Date.UTC(year, 0, 1))
  if (preset === 'quarter') return iso(Date.UTC(year, Math.floor(month / 3) * 3, 1))
  if (preset === 'month') return iso(Date.UTC(year, month, 1))
  if (preset === 'yesterday') return iso(Date.UTC(year, month, day - 1))
  return iso(Date.UTC(year, month, day))
}

const calendarPresets: DatePresetId[] = ['year', 'quarter', 'month', 'yesterday', 'today']

/** Date fields take a plain date, timestamp fields an instant. */
const instant = (value: string, kind: Fields['dateKind']) => (kind === 'date' ? { kind: 'string' as const, value: value.slice(0, 10), span } : { kind: 'timestamp' as const, value, span })

const dateClauses = (field: string, preset: DatePresetId, now: Date, kind: Fields['dateKind']): FilterExpr[] => {
  if (preset in relative) return [w.gte(field, w.ago(preset))]
  const from = w.gte(field, instant(periodStart(preset, now), kind))
  return preset === 'yesterday' ? [from, w.lt(field, instant(periodStart('today', now), kind))] : [from]
}

/** The panel's state as filter clauses, in a fixed order so the text is stable. */
export const stateToClauses = (config: Fields, state: FilterState, now = new Date()): FilterExpr[] => {
  const facets = config.facets.flatMap((group) => {
    const values = state.facets[group.id] ?? []
    if (values.length === 0) return []
    return [values.length === 1 ? w.eq(group.id, values[0]!) : w.in(group.id, values)]
  })
  const range = config.range && state.range ? [w.gte(config.range.id, state.range[0]), w.lte(config.range.id, state.range[1])] : []
  const date = config.dateField && state.date ? dateClauses(config.dateField, state.date, now, config.dateKind) : []
  const toggles = (config.toggles ?? []).filter((toggle) => state.toggles.includes(toggle.id)).map((toggle) => w.eq(toggle.id, true))
  return [...facets, ...range, ...date, ...toggles]
}

export const clausesToText = (clauses: FilterExpr[]) => (clauses.length === 0 ? '' : printFilter(w.and(...clauses)))

export const stateToText = (config: Fields, state: FilterState, extras: FilterExpr[] = [], now = new Date()) =>
  clausesToText([...stateToClauses(config, state, now), ...extras])

const flatten = (expr: FilterExpr): FilterExpr[] => (expr.kind === 'and' ? expr.args.flatMap(flatten) : [expr])

const fieldName = (expr: { field: { path: string[] } }) => expr.field.path.join('.')

const literalText = (value: { kind: string; value?: unknown; raw?: string }) => (value.kind === 'number' ? String(value.raw) : value.kind === 'string' ? String(value.value) : undefined)

const presetOf = (clause: FilterExpr & { kind: 'compare' }, now: Date): DatePresetId | undefined => {
  const v = clause.value
  if (v.kind === 'now' && v.offset?.sign === '-') {
    const { amount, unit } = v.offset.duration
    return (Object.entries(relative) as Array<[DatePresetId, { amount: number; unit: string }]>).find(([, d]) => d.amount === amount && d.unit === unit)?.[0]
  }
  if (v.kind === 'timestamp') return calendarPresets.find((preset) => periodStart(preset, now) === v.value)
  if (v.kind === 'string') return calendarPresets.find((preset) => periodStart(preset, now).slice(0, 10) === v.value)
  return undefined
}

export type ParsedFilter = { ok: true; state: FilterState; extras: FilterExpr[] } | { ok: false; errors: FilterError[] }

/**
 * The inverse of `stateToText`: clauses that match a widget fill the panel state, everything else
 * (search text, hand-written conditions) is returned as `extras` and survives the round trip.
 */
export const textToState = (config: Fields, text: string, now = new Date()): ParsedFilter => {
  const parsed = parseFilter(text)
  if (!parsed.ok) return { ok: false, errors: parsed.errors }
  const state: FilterState = { facets: {}, toggles: [] }
  const extras: FilterExpr[] = []
  const facetIds = new Set(config.facets.map((group) => group.id))
  const toggleIds = new Set((config.toggles ?? []).map((toggle) => toggle.id))
  const bounds: { low?: number; high?: number; clauses: FilterExpr[] } = { clauses: [] }
  let dateClause: FilterExpr | undefined
  let todayEnd: FilterExpr | undefined

  for (const clause of parsed.ast ? flatten(parsed.ast) : []) {
    if (clause.kind === 'compare' && facetIds.has(fieldName(clause)) && clause.op === '=' && literalText(clause.value) !== undefined) {
      state.facets[fieldName(clause)] = [...(state.facets[fieldName(clause)] ?? []), literalText(clause.value)!]
    } else if (clause.kind === 'in' && facetIds.has(fieldName(clause)) && clause.values.every((value) => literalText(value) !== undefined)) {
      state.facets[fieldName(clause)] = [...(state.facets[fieldName(clause)] ?? []), ...clause.values.map((value) => literalText(value)!)]
    } else if (clause.kind === 'compare' && config.dateField === fieldName(clause) && clause.op === '>=' && presetOf(clause, now) && !state.date) {
      state.date = presetOf(clause, now)
      dateClause = clause
    } else if (clause.kind === 'compare' && config.dateField === fieldName(clause) && clause.op === '<' && (clause.value.kind === 'timestamp' || clause.value.kind === 'string') && periodStart('today', now).startsWith(clause.value.value.slice(0, 10))) {
      todayEnd = clause
    } else if (clause.kind === 'compare' && toggleIds.has(fieldName(clause)) && clause.op === '=' && clause.value.kind === 'boolean' && clause.value.value) {
      state.toggles.push(fieldName(clause))
    } else if (clause.kind === 'compare' && config.range?.id === fieldName(clause) && (clause.op === '>=' || clause.op === '<=') && clause.value.kind === 'number') {
      if (clause.op === '>=') bounds.low = clause.value.value
      else bounds.high = clause.value.value
      bounds.clauses.push(clause)
    } else {
      extras.push(clause)
    }
  }

  if (state.date === 'yesterday' && !todayEnd) {
    extras.push(dateClause!)
    state.date = undefined
  }
  if (todayEnd && state.date !== 'yesterday') extras.push(todayEnd)
  if (bounds.low !== undefined && bounds.high !== undefined) state.range = [bounds.low, bounds.high]
  else extras.push(...bounds.clauses)
  return { ok: true, state, extras }
}
