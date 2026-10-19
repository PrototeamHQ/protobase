import { describe, expect, it } from 'vitest'
import { f, resource, view } from '@protobase/schema'
import { barOf, scaledTimeline, stepTimeline, timelineDays, timelineHeading, timelineLanes, timelineRange, timelineTicks, timelineView, type TimelineDisplayModel } from './timeline-range'

const jobs = resource('jobs')
  .table('jobs')
  .fields({
    id: f.integer(),
    title: f.text(),
    stage: f.enum(['planned', 'building', 'done']),
    crew_id: f.relation('crews'),
    size: f.integer(),
    starts: f.date().filterable(),
    ends: f.date().filterable(),
  })
  .primaryKey((r) => r.id)
const model = jobs.toModel()
const jobsView = view<typeof jobs>('jobs')
  .fields((r) => ({ stage: r.stage.label('Phase').valueLabels({ building: 'Being built' }) }))
  .toModel(model)
const spanning: TimelineDisplayModel = { kind: 'timeline', name: 'timeline', start: 'starts', end: 'ends' }
const now = Date.parse('2026-10-14T15:00:00Z')

describe('timelineView', () => {
  it("shows the month of now without an address, and the address's week from Monday, month from its 1st or quarter from its first month", () => {
    expect(timelineView(undefined, now, 'UTC')).toEqual({ scale: 'month', day: '2026-10-01' })
    expect(timelineView({ scale: 'week', day: '2026-10-18' }, now)).toEqual({ scale: 'week', day: '2026-10-12' })
    expect(timelineView({ scale: 'quarter', day: '2026-08-20' }, now)).toEqual({ scale: 'quarter', day: '2026-07-01' })
  })

  it('steps a week, a month or a quarter across a year', () => {
    expect(stepTimeline({ scale: 'week', day: '2026-12-28' }, 1)).toEqual({ scale: 'week', day: '2027-01-04' })
    expect(stepTimeline({ scale: 'month', day: '2026-01-01' }, -1)).toEqual({ scale: 'month', day: '2025-12-01' })
    expect(stepTimeline({ scale: 'quarter', day: '2026-10-01' }, 1)).toEqual({ scale: 'quarter', day: '2027-01-01' })
  })

  it('switches to the period holding today when the period shown holds it, else to the one holding its first day', () => {
    expect(scaledTimeline({ scale: 'quarter', day: '2026-10-01' }, 'week', now, 'UTC')).toEqual({ scale: 'week', day: '2026-10-12' })
    expect(scaledTimeline({ scale: 'quarter', day: '2027-01-01' }, 'month', now, 'UTC')).toEqual({ scale: 'month', day: '2027-01-01' })
    expect(scaledTimeline({ scale: 'week', day: '2026-09-28' }, 'month', now, 'UTC')).toEqual({ scale: 'month', day: '2026-09-01' })
  })
})

describe('timelineDays', () => {
  it("shows a week's seven days, a month's own days and a quarter's", () => {
    expect(timelineDays({ scale: 'week', day: '2026-10-12' })).toHaveLength(7)
    const february = timelineDays({ scale: 'month', day: '2027-02-01' })
    expect([february.length, february[0], february.at(-1)]).toEqual([28, '2027-02-01', '2027-02-28'])
    const autumn = timelineDays({ scale: 'quarter', day: '2026-10-01' })
    expect([autumn.length, autumn[0], autumn.at(-1)]).toEqual([92, '2026-10-01', '2026-12-31'])
    expect(timelineRange({ scale: 'quarter', day: '2026-10-01' })).toEqual({ from: '2026-10-01', to: '2027-01-01' })
  })

  it('heads a week by its days, a month by its name and a quarter by its months', () => {
    expect(timelineHeading({ scale: 'week', day: '2026-10-12' })).toMatch(/^12\s?–\s?18 Oct 2026$/)
    expect(timelineHeading({ scale: 'month', day: '2026-10-01' })).toBe('October 2026')
    expect(timelineHeading({ scale: 'quarter', day: '2026-10-01' })).toMatch(/^October\s?–\s?December 2026$/)
  })

  it("marks a week's days, a month's days with only each seventh on a phone, and a quarter's months", () => {
    expect(timelineTicks({ scale: 'week', day: '2026-10-12' })[0]).toEqual({ index: 0, span: 1, label: 'Mon 12' })
    const october = timelineTicks({ scale: 'month', day: '2026-10-01' })
    expect(october.filter((tick) => !tick.minor).map((tick) => tick.label)).toEqual(['1', '8', '15', '22', '29'])
    expect(timelineTicks({ scale: 'quarter', day: '2026-10-01' })).toEqual([
      { index: 0, span: 31, label: 'October' },
      { index: 31, span: 30, label: 'November' },
      { index: 61, span: 31, label: 'December' },
    ])
  })
})

describe('barOf', () => {
  const week = timelineDays({ scale: 'week', day: '2026-10-12' })

  it('spans the days a record is on, cut off where it starts before or ends after the days shown', () => {
    expect(barOf({ starts: '2026-10-13', ends: '2026-10-15' }, spanning, model, week)).toEqual({ first: 1, last: 3, before: false, after: false, start: '2026-10-13' })
    expect(barOf({ starts: '2026-10-01', ends: '2026-10-30' }, spanning, model, week)).toEqual({ first: 0, last: 6, before: true, after: true, start: '2026-10-01' })
    expect(barOf({ starts: '2026-10-14' }, { ...spanning, end: undefined }, model, week)).toMatchObject({ first: 2, last: 2 })
  })

  it('has no bar for a record without a start or off the days shown', () => {
    expect(barOf({ starts: null, ends: '2026-10-14' }, spanning, model, week)).toBeUndefined()
    expect(barOf({ starts: '2026-10-01', ends: '2026-10-11' }, spanning, model, week)).toBeUndefined()
  })
})

describe('timelineLanes', () => {
  const row = (key: string, record: Record<string, unknown>, labels: Record<string, string> = {}) => ({ key, record, labels })

  it('keeps every record in one lane without a group', () => {
    expect(timelineLanes([row('1', {}), row('2', {})], model, jobsView, spanning)).toEqual([{ key: '', rows: [row('1', {}), row('2', {})] }])
  })

  it("puts an enum's lanes in the field's order with their value labels, and the records without a value last", () => {
    const rows = [row('1', { stage: 'done' }), row('2', { stage: null }), row('3', { stage: 'building' }), row('4', { stage: 'done' })]
    const lanes = timelineLanes(rows, model, jobsView, { ...spanning, group: 'stage' })
    expect(lanes.map((lane) => [lane.label, lane.rows.map((entry) => entry.key)])).toEqual([
      ['Being built', ['3']],
      ['done', ['1', '4']],
      ['No phase', ['2']],
    ])
  })

  it("orders a relation's lanes by the names of the records it points at, and numbers by value", () => {
    const crews = [row('1', { crew_id: 7 }, { crew_id: 'Zeta' }), row('2', { crew_id: 3 }, { crew_id: 'Alpha' })]
    expect(timelineLanes(crews, model, jobsView, { ...spanning, group: 'crew_id' }).map((lane) => lane.label)).toEqual(['Alpha', 'Zeta'])
    const sizes = [row('1', { size: 10 }), row('2', { size: 9 })]
    expect(timelineLanes(sizes, model, jobsView, { ...spanning, group: 'size' }).map((lane) => lane.label)).toEqual(['9', '10'])
  })
})
