import { afterEach, describe, expect, it } from 'vitest'
import { setAppLocale } from '../../locale/active-locale'
import { isCurrent, periodText } from './period-text'

const at = (wall: string) => Date.parse(`${wall}Z`)
const now = at('2026-11-12T15:30:00')
// ICU puts thin spaces around a range's dash; written here as plain ones
const plain = (period: string) => period.replace(/[\u2009\u202f]/g, ' ')

afterEach(() => setAppLocale(undefined))

describe('periodText', () => {
  it('names a past week from its first to its last day', () => {
    expect(plain(periodText(at('2026-08-24T00:00:00'), 'week', now))).toBe('24 – 30 Aug 2026')
    expect(plain(periodText(at('2026-08-31T00:00:00'), 'week', now))).toBe('31 Aug – 6 Sept 2026')
  })

  it('names a past month from its first to its last day', () => {
    expect(plain(periodText(at('2026-02-01T00:00:00'), 'month', now))).toBe('1 – 28 Feb 2026')
  })

  it('names the running week or month up to today', () => {
    expect(periodText(at('2026-11-09T00:00:00'), 'week', now)).toBe('9 Nov to today')
    expect(periodText(at('2026-11-01T00:00:00'), 'month', now)).toBe('1 Nov to today')
  })

  it('names the year of a running week that started in the year before', () => {
    expect(periodText(at('2026-12-28T00:00:00'), 'week', at('2027-01-02T08:00:00'))).toBe('28 Dec 2026 to today')
  })

  it('names a past year by its number and the running one up to today', () => {
    expect(periodText(at('2025-01-01T00:00:00'), 'year', now)).toBe('2025')
    expect(periodText(at('2026-01-01T00:00:00'), 'year', now)).toBe('1 Jan to today')
  })

  it('names the running day today', () => {
    expect(periodText(at('2026-11-12T00:00:00'), 'day', now)).toBe('Today')
  })

  it('keeps a single date for a past day and the start of a shorter bucket', () => {
    expect(periodText(at('2026-11-11T00:00:00'), 'day', now)).toBe('11 Nov 2026')
    expect(periodText(at('2026-11-12T14:00:00'), 'hour', now)).toBe('12 Nov, 14:00')
  })

  it('writes the period in the app locale', () => {
    setAppLocale('nl')
    expect(plain(periodText(at('2026-08-24T00:00:00'), 'week', now))).toBe('24–30 aug 2026')
    expect(periodText(at('2026-11-09T00:00:00'), 'week', now)).toBe('9 nov tot vandaag')
  })
})

describe('isCurrent', () => {
  it('holds for the day, week or month that runs at now, and never for a shorter bucket', () => {
    expect(isCurrent(at('2026-11-09T00:00:00'), 'week', now)).toBe(true)
    expect(isCurrent(at('2026-11-02T00:00:00'), 'week', now)).toBe(false)
    expect(isCurrent(at('2026-11-01T00:00:00'), 'month', now)).toBe(true)
    expect(isCurrent(at('2026-11-12T00:00:00'), 'day', now)).toBe(true)
    expect(isCurrent(at('2026-11-11T00:00:00'), 'day', now)).toBe(false)
    expect(isCurrent(at('2026-11-12T15:00:00'), 'hour', now)).toBe(false)
  })
})
