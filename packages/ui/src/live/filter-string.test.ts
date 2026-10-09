import { describe, expect, it } from 'vitest'
import { parseFilter } from '@protobase/schema'
import { stateToText, textToState } from './filter-string'

const config = {
  facets: [
    { id: 'status', label: 'Status', options: [] },
    { id: 'ownerId', label: 'Owner', options: [] },
  ],
  range: { id: 'total', label: 'Total', min: 0, max: 1000, step: 10, histogram: [], format: String },
  dateField: 'createdAt',
  toggles: [{ id: 'paid', label: 'Paid' }],
}

const now = new Date(Date.UTC(2026, 9, 6))

const roundTrip = (text: string) => {
  const parsed = textToState(config, text, now)
  if (!parsed.ok) throw new Error('parse failed')
  return stateToText(config, parsed.state, parsed.extras, now)
}

describe('stateToText', () => {
  it('prints one facet value as an equality and several as in()', () => {
    expect(stateToText(config, { facets: { status: ['draft'] }, toggles: [] }, [], now)).toBe('status = "draft"')
    expect(stateToText(config, { facets: { status: ['draft', 'shipped'] }, toggles: [] }, [], now)).toBe('in(status, "draft", "shipped")')
  })

  it('is empty without active filters', () => {
    expect(stateToText(config, { facets: {}, toggles: [] }, [], now)).toBe('')
    expect(stateToText(config, { facets: { status: [] }, toggles: [] }, [], now)).toBe('')
  })

  it('prints presets, ranges and toggles', () => {
    const text = stateToText(config, { facets: {}, range: [10, 200], date: '7d', toggles: ['paid'] }, [], now)
    expect(text).toBe('total >= 10 AND total <= 200 AND createdAt >= now() - 7d AND paid = true')
  })

  it('prints this year as the first instant of the year', () => {
    expect(stateToText(config, { facets: {}, date: 'year', toggles: [] }, [], now)).toContain('2026-01-01T00:00:00Z')
  })

  it('always produces text the parser accepts', () => {
    const text = stateToText(config, { facets: { status: ['draft', 'shipped'], ownerId: ['5'] }, range: [1, 2], date: '30d', toggles: ['paid'] }, [], now)
    expect(parseFilter(text).ok).toBe(true)
  })
})

describe('textToState', () => {
  it('reads widget clauses back into the panel state', () => {
    const parsed = textToState(config, 'in(status, "draft", "shipped") AND ownerId = 5 AND createdAt >= now() - 30d AND total >= 10 AND total <= 200 AND paid = true', now)
    expect(parsed).toEqual({
      ok: true,
      state: { facets: { status: ['draft', 'shipped'], ownerId: ['5'] }, date: '30d', range: [10, 200], toggles: ['paid'] },
      extras: [],
    })
  })

  it('keeps clauses no widget owns as extras', () => {
    const parsed = textToState(config, 'status = "draft" AND notes = "rush"', now)
    expect(parsed.ok && parsed.state.facets).toEqual({ status: ['draft'] })
    expect(parsed.ok && parsed.extras).toHaveLength(1)
  })

  it('reports syntax errors with spans', () => {
    const parsed = textToState(config, 'status = ', now)
    expect(parsed.ok).toBe(false)
    expect(!parsed.ok && parsed.errors[0]?.span).toBeDefined()
  })

  it('treats an empty string as no filter', () => {
    expect(textToState(config, '', now)).toEqual({ ok: true, state: { facets: {}, toggles: [] }, extras: [] })
  })
})

describe('date presets', () => {
  const november = new Date(Date.UTC(2026, 10, 15))
  const text = (date: 'today' | 'yesterday' | '90d' | 'month' | 'quarter') => stateToText(config, { facets: {}, date, toggles: [] }, [], november)

  it('prints relative and calendar presets', () => {
    expect(text('90d')).toBe('createdAt >= now() - 90d')
    expect(text('quarter')).toBe('createdAt >= 2026-10-01T00:00:00Z')
    expect(text('month')).toBe('createdAt >= 2026-11-01T00:00:00Z')
    expect(text('today')).toBe('createdAt >= 2026-11-15T00:00:00Z')
    expect(text('yesterday')).toBe('createdAt >= 2026-11-14T00:00:00Z AND createdAt < 2026-11-15T00:00:00Z')
  })

  it.each(['90d', 'month', 'quarter', 'today', 'yesterday'] as const)('reads %s back', (preset) => {
    const parsed = textToState(config, text(preset), november)
    expect(parsed).toMatchObject({ ok: true, state: { date: preset }, extras: [] })
  })

  it('keeps a lone upper bound as an extra', () => {
    const parsed = textToState(config, 'createdAt < 2026-11-15T00:00:00Z', november)
    expect(parsed.ok && parsed.state.date).toBeUndefined()
    expect(parsed.ok && parsed.extras).toHaveLength(1)
  })
})

describe('date fields', () => {
  const dates = { ...config, dateKind: 'date' as const }
  const november = new Date(Date.UTC(2026, 10, 15))

  it('prints calendar presets as plain dates', () => {
    expect(stateToText(dates, { facets: {}, date: 'quarter', toggles: [] }, [], november)).toBe('createdAt >= "2026-10-01"')
    expect(stateToText(dates, { facets: {}, date: 'yesterday', toggles: [] }, [], november)).toBe('createdAt >= "2026-11-14" AND createdAt < "2026-11-15"')
  })

  it('reads them back', () => {
    const parsed = textToState(dates, 'createdAt >= "2026-10-01"', november)
    expect(parsed).toMatchObject({ ok: true, state: { date: 'quarter' }, extras: [] })
    expect(textToState(dates, 'createdAt >= "2026-11-14" AND createdAt < "2026-11-15"', november)).toMatchObject({ ok: true, state: { date: 'yesterday' }, extras: [] })
  })
})

describe('round trip', () => {
  it.each([
    'status = "draft"',
    'in(status, "draft", "shipped") AND ownerId = "5"',
    'createdAt >= now() - 7d AND paid = true',
    'total >= 10 AND total <= 200',
    'status = "draft" AND notes = "rush"',
  ])('keeps %s', (text) => {
    const first = roundTrip(text)
    expect(roundTrip(first)).toBe(first)
    expect(textToState(config, first, now)).toEqual(textToState(config, text, now))
  })
})
