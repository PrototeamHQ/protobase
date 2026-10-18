import { describe, expect, it } from 'vitest'
import { f, resource } from '@protobase/schema'
import { byDay, calendarView, eventDays, gridDays, movedPatch, rangeFilter, rangeOf, stepView, todayView, withRange, type CalendarDisplayModel } from './calendar-range'

const bookings = resource('bookings')
  .table('bookings')
  .fields({ id: f.integer(), on: f.date().filterable(), until: f.date().filterable(), starts_at: f.timestamp().filterable(), ends_at: f.timestamp().filterable() })
  .primaryKey((r) => r.id)
const model = bookings.toModel()
const onDay: CalendarDisplayModel = { kind: 'calendar', name: 'calendar', start: 'on' }
const spanning: CalendarDisplayModel = { kind: 'calendar', name: 'calendar', start: 'on', end: 'until' }
const timed: CalendarDisplayModel = { kind: 'calendar', name: 'calendar', start: 'starts_at', end: 'ends_at' }
const now = Date.parse('2026-10-14T15:00:00Z')

describe('calendarView', () => {
  it("shows the month of now without an address, and the address's month from its 1st or week from its Monday", () => {
    expect(calendarView(undefined, now)).toEqual({ scale: 'month', day: '2026-10-01' })
    expect(calendarView({ scale: 'month', day: '2026-10-20' }, now)).toEqual({ scale: 'month', day: '2026-10-01' })
    expect(calendarView({ scale: 'week', day: '2026-10-14' }, now)).toEqual({ scale: 'week', day: '2026-10-12' })
    expect(calendarView({ scale: 'week', day: '2026-10-18' }, now)).toEqual({ scale: 'week', day: '2026-10-12' })
  })

  it('goes to the month or week of now, and steps a month or week across a year', () => {
    expect(todayView('week', now)).toEqual({ scale: 'week', day: '2026-10-12' })
    expect(stepView({ scale: 'month', day: '2026-12-01' }, 1)).toEqual({ scale: 'month', day: '2027-01-01' })
    expect(stepView({ scale: 'month', day: '2026-01-01' }, -1)).toEqual({ scale: 'month', day: '2025-12-01' })
    expect(stepView({ scale: 'week', day: '2026-12-28' }, 1)).toEqual({ scale: 'week', day: '2027-01-04' })
  })
})

describe('gridDays', () => {
  it('shows whole weeks around a month, and the seven days of a week', () => {
    const october = gridDays({ scale: 'month', day: '2026-10-01' })
    expect([october.length, october[0], october.at(-1)]).toEqual([35, '2026-09-28', '2026-11-01'])
    const february = gridDays({ scale: 'month', day: '2027-02-01' })
    expect([february.length, february[0], february.at(-1)]).toEqual([28, '2027-02-01', '2027-02-28'])
    expect(gridDays({ scale: 'month', day: '2026-08-01' })).toHaveLength(42)
    expect(gridDays({ scale: 'week', day: '2026-10-12' })).toEqual(['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18'])
  })

  it('ranges from the first day shown to the day after the last', () => {
    expect(rangeOf({ scale: 'month', day: '2026-10-01' })).toEqual({ from: '2026-09-28', to: '2026-11-02' })
  })
})

describe('rangeFilter', () => {
  const range = { from: '2026-09-28', to: '2026-11-02' }

  it('finds the records starting in the range', () => {
    expect(rangeFilter(onDay, model, range)).toBe('on >= "2026-09-28" AND on < "2026-11-02"')
  })

  it('finds those starting before it and ending in it too, a timestamp end being over at its instant', () => {
    expect(rangeFilter(spanning, model, range)).toBe('(on >= "2026-09-28" AND on < "2026-11-02") OR (on < "2026-09-28" AND until >= "2026-09-28")')
    expect(rangeFilter(timed, model, range)).toBe(
      '(starts_at >= 2026-09-28T00:00:00Z AND starts_at < 2026-11-02T00:00:00Z) OR (starts_at < 2026-09-28T00:00:00Z AND ends_at > 2026-09-28T00:00:00Z)',
    )
  })

  it("narrows the list's own filter", () => {
    expect(withRange('', 'on >= "2026-09-28"')).toBe('on >= "2026-09-28"')
    expect(withRange('a = 1 OR b = 2', 'on >= "2026-09-28"')).toBe('(a = 1 OR b = 2) AND (on >= "2026-09-28")')
  })
})

describe('eventDays', () => {
  const week = gridDays({ scale: 'week', day: '2026-10-12' })

  it('puts a record on its start day, or on every day through its end within the days shown', () => {
    expect(eventDays({ on: '2026-10-14' }, onDay, model, week)).toEqual(['2026-10-14'])
    expect(eventDays({ on: '2026-10-14', until: '2026-10-16' }, spanning, model, week)).toEqual(['2026-10-14', '2026-10-15', '2026-10-16'])
    expect(eventDays({ on: '2026-10-08', until: '2026-10-13' }, spanning, model, week)).toEqual(['2026-10-12', '2026-10-13'])
    expect(eventDays({ on: '2026-10-17', until: '2026-10-25' }, spanning, model, week)).toEqual(['2026-10-17', '2026-10-18'])
  })

  it('leaves out the day a timestamp ends on at midnight, and keeps a day it ends in', () => {
    expect(eventDays({ starts_at: '2026-10-14T22:00:00Z', ends_at: '2026-10-15T00:00:00Z' }, timed, model, week)).toEqual(['2026-10-14'])
    expect(eventDays({ starts_at: '2026-10-14T22:00:00Z', ends_at: '2026-10-15T01:00:00Z' }, timed, model, week)).toEqual(['2026-10-14', '2026-10-15'])
  })

  it('takes the start day alone without an end or with an earlier one, and no day without a start', () => {
    expect(eventDays({ on: '2026-10-14', until: null }, spanning, model, week)).toEqual(['2026-10-14'])
    expect(eventDays({ on: '2026-10-14', until: '2026-10-10' }, spanning, model, week)).toEqual(['2026-10-14'])
    expect(eventDays({ on: null, until: '2026-10-14' }, spanning, model, week)).toEqual([])
  })

  it("orders each day's records by their start", () => {
    const row = (key: string, starts_at: string) => ({ key, record: { starts_at }, labels: {} })
    const days = byDay([row('late', '2026-10-14T16:00:00Z'), row('early', '2026-10-14T08:00:00Z')], timed, model, week)
    expect(days.get('2026-10-14')!.map((entry) => entry.key)).toEqual(['early', 'late'])
    expect(days.get('2026-10-15')).toEqual([])
  })
})

describe('movedPatch', () => {
  it('moves a date, and its end by the same days', () => {
    expect(movedPatch({ on: '2026-10-08' }, onDay, model, '2026-10-08', '2026-10-09')).toEqual({ on: '2026-10-09' })
    expect(movedPatch({ on: '2026-10-08', until: '2026-10-10' }, spanning, model, '2026-10-09', '2026-10-05')).toEqual({ on: '2026-10-04', until: '2026-10-06' })
    expect(movedPatch({ on: '2026-10-08', until: null }, spanning, model, '2026-10-08', '2026-10-09')).toEqual({ on: '2026-10-09' })
  })

  it('moves a timestamp keeping its time of day', () => {
    expect(movedPatch({ starts_at: '2026-10-08T09:30:00Z', ends_at: '2026-10-08T11:00:00Z' }, timed, model, '2026-10-08', '2026-10-15')).toEqual({
      starts_at: '2026-10-15T09:30:00.000Z',
      ends_at: '2026-10-15T11:00:00.000Z',
    })
  })
})
