import { describe, expect, it } from 'vitest'
import { localInputValue } from './clear-time'
import { draftOf, pickedStatus, type StatusDraft } from './status-draft'

const now = new Date(2026, 9, 28, 14, 20)
const draft = (changes: Partial<StatusDraft>): StatusDraft => ({ availability: 'automatic', text: '', clears: 'never', custom: '', ...changes })

describe('draftOf', () => {
  it('starts from automatic and never without a status, or with one whose time has passed', () => {
    expect(draftOf(null, now.getTime())).toEqual(draft({}))
    expect(draftOf({ availability: 'busy', text: 'Out', clearsAt: new Date(2026, 9, 28, 14).toISOString() }, now.getTime())).toEqual(draft({}))
  })

  it('starts from the status that holds, its clear time as a date and time', () => {
    const clearsAt = new Date(2026, 9, 28, 15, 30).toISOString()
    expect(draftOf({ availability: 'do_not_disturb', text: 'Focus', clearsAt }, now.getTime())).toEqual(draft({ availability: 'do_not_disturb', text: 'Focus', clears: 'custom', custom: localInputValue(clearsAt) }))
    expect(draftOf({ availability: 'busy', text: null, clearsAt: null }, now.getTime())).toEqual(draft({ availability: 'busy' }))
  })
})

describe('pickedStatus', () => {
  it('sets the availability, the trimmed text and the clear time', () => {
    expect(pickedStatus(draft({ availability: 'busy', text: '  Having lunch ', clears: 'one_hour' }), now)).toEqual({ input: { availability: 'busy', text: 'Having lunch', clearsAt: new Date(2026, 9, 28, 15, 20).toISOString() } })
    expect(pickedStatus(draft({ availability: 'do_not_disturb', text: '   ' }), now)).toEqual({ input: { availability: 'do_not_disturb', text: null, clearsAt: null } })
    expect(pickedStatus(draft({ text: 'On vacation 🌴', clears: 'custom', custom: '2026-11-02T09:00' }), now)).toEqual({ input: { availability: 'automatic', text: 'On vacation 🌴', clearsAt: new Date(2026, 10, 2, 9).toISOString() } })
  })

  it('refuses a text over the limit or with control characters, saying why', () => {
    expect(pickedStatus(draft({ text: 'a'.repeat(101) }), now)).toEqual({ problem: 'text', message: 'A status is at most 100 characters' })
    expect(pickedStatus(draft({ text: 'two\nlines' }), now)).toEqual({ problem: 'text', message: 'A status is one line of text, without control characters' })
  })

  it('refuses a date and time that is missing or already passed', () => {
    expect(pickedStatus(draft({ clears: 'custom', custom: '' }), now)).toEqual({ problem: 'time' })
    expect(pickedStatus(draft({ clears: 'custom', custom: '2026-10-28T14:20' }), now)).toEqual({ problem: 'time' })
  })
})
