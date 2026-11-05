import { printFilter } from '@protobase/schema'
import { describe, expect, it } from 'vitest'
import { readyAt, readyWhen } from './ready-when'

describe('readyWhen', () => {
  it('reads the time terms off the top-level AND and keeps the rest as the filter', () => {
    const result = readyWhen("status = 'sent' AND due_at <= now() - 3d AND reminded_at < now()")
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.when.timeTerms).toEqual([{ field: 'due_at', afterMs: 3 * 86_400_000 }, { field: 'reminded_at', afterMs: 0 }])
    expect(printFilter(result.when.filter!)).toBe('status = "sent"')
  })

  it('refuses now() inside an OR, or compared the other way, naming the term', () => {
    expect(readyWhen("status = 'sent' OR due_at <= now()")).toEqual({ ok: false, problems: ['"status = "sent" OR due_at <= now()" uses now() other than as <timestamp field> <= now() - <duration> joined by AND'] })
    expect(readyWhen('due_at > now() - 1d')).toMatchObject({ ok: false })
    expect(readyWhen('due_at <= now() + 1d')).toMatchObject({ ok: false })
  })

  it('takes no when, and a when with no time term', () => {
    expect(readyWhen(undefined)).toEqual({ ok: true, when: { filter: undefined, timeTerms: [] } })
    expect(readyWhen("status = 'sent'")).toMatchObject({ ok: true, when: { timeTerms: [] } })
  })
})

describe('readyAt', () => {
  const now = new Date('2026-11-05T10:00:00Z')

  it('is the latest time term, now when they have passed, and undefined when a time is unset', () => {
    const terms = [{ field: 'due_at', afterMs: 3 * 86_400_000 }]
    expect(readyAt(terms, { due_at: '2026-11-04T10:00:00Z' }, now)).toEqual(new Date('2026-11-07T10:00:00Z'))
    expect(readyAt(terms, { due_at: '2026-10-01T10:00:00Z' }, now)).toEqual(now)
    expect(readyAt(terms, { due_at: null }, now)).toBeUndefined()
    expect(readyAt([], {}, now)).toEqual(now)
  })
})
