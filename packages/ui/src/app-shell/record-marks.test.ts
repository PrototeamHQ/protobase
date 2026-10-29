import { describe, expect, it } from 'vitest'
import { markRecords, recordNames } from './record-marks'

const general = { id: 'general', label: 'general', href: '/channels/general', active: false }
const random = { id: 'random', label: 'random', href: '/channels/random', active: true }

describe('markRecords', () => {
  it('marks each record by its id and keeps their order', () => {
    const marked = markRecords([general, random], { random: { strong: true, count: 2 }, other: { strong: true } })
    expect(marked).toEqual([general, { ...random, mark: { strong: true, count: 2 } }])
  })

  it('leaves the records unmarked while the marks load', () => {
    expect(markRecords([general, random], undefined)).toEqual([general, random])
  })

  it('reads only the marks of its own records, not those an object inherits', () => {
    expect(markRecords([{ ...general, id: 'toString' }], {})).toEqual([{ ...general, id: 'toString' }])
  })
})

describe('recordNames', () => {
  it('names a record by its title, its status and its mark', () => {
    expect(recordNames(general)).toEqual({ ariaLabel: 'general', title: 'general' })
    expect(recordNames({ ...general, mark: { strong: true, count: 3, label: '3 mentions' } })).toEqual({ ariaLabel: 'general, 3 mentions', title: 'general (3 mentions)' })
    expect(recordNames({ ...general, status: { label: 'picking', tone: 'warning', pulse: false }, mark: { label: 'unread' } })).toEqual({ ariaLabel: 'general, picking, unread', title: 'general (picking, unread)' })
  })

  it("names a person's presence, availability and text, only of a status that holds now", () => {
    const lunch = { availability: 'busy', text: 'Having lunch', clearsAt: null } as const
    expect(recordNames({ ...general, mark: { person: { presence: 'online', status: lunch }, label: '2 unread' } })).toEqual({ ariaLabel: 'general, Online, Busy, Having lunch, 2 unread', title: 'general (Online, Busy, Having lunch, 2 unread)' })
    expect(recordNames({ ...general, mark: { person: { status: { availability: 'automatic', text: 'On vacation', clearsAt: null } } } })).toEqual({ ariaLabel: 'general, On vacation', title: 'general (On vacation)' })
    expect(recordNames({ ...general, mark: { person: { presence: 'away', status: { ...lunch, clearsAt: '2020-01-01T00:00:00.000Z' } } } })).toEqual({ ariaLabel: 'general, Away', title: 'general (Away)' })
    expect(recordNames({ ...general, mark: { person: {} } })).toEqual({ ariaLabel: 'general', title: 'general' })
  })
})
