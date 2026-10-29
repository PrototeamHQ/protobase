import { describe, expect, it } from 'vitest'
import { HttpProblem } from '../problem'
import { statusInput } from './status-input'

const now = new Date('2026-10-29T12:00:00Z')

const refusal = (given: unknown) => {
  try {
    statusInput(given, now)
  } catch (error) {
    if (!(error instanceof HttpProblem)) throw error
    return { status: error.status, slug: error.slug, detail: error.message }
  }
  throw new Error('statusInput took it')
}

describe('statusInput', () => {
  it('takes an availability, a trimmed text and a clear time to come, as UTC', () => {
    expect(statusInput({ availability: 'busy', text: '  Having lunch ', clearsAt: '2026-10-29T14:00:00+01:00' }, now)).toEqual({ availability: 'busy', text: 'Having lunch', clearsAt: '2026-10-29T13:00:00.000Z' })
    expect(statusInput({ availability: 'do_not_disturb', text: null, clearsAt: null }, now)).toEqual({ availability: 'do_not_disturb', text: null, clearsAt: null })
    expect(statusInput({ availability: 'automatic', text: 'On vacation 🌴', clearsAt: null }, now)).toEqual({ availability: 'automatic', text: 'On vacation 🌴', clearsAt: null })
  })

  it('takes an empty text as none', () => {
    expect(statusInput({ availability: 'busy', text: '   ', clearsAt: null }, now).text).toBeNull()
  })

  it('refuses a text over the limit, or with control characters, saying why', () => {
    expect(refusal({ availability: 'busy', text: 'a'.repeat(101), clearsAt: null })).toEqual({ status: 400, slug: 'invalid-status-text', detail: 'A status is at most 100 characters' })
    expect(refusal({ availability: 'busy', text: 'a\u0000b', clearsAt: null })).toEqual({ status: 400, slug: 'invalid-status-text', detail: 'A status is one line of text, without control characters' })
  })

  it('refuses a clear time that has passed, or is now', () => {
    expect(refusal({ availability: 'busy', text: null, clearsAt: '2026-10-29T12:00:00Z' })).toMatchObject({ status: 400, slug: 'invalid-clear-time' })
  })

  it.each([
    ['an unknown availability', { availability: 'away', text: null, clearsAt: null }],
    ['a missing field', { availability: 'busy', text: null }],
    ['a user it names', { availability: 'busy', text: null, clearsAt: null, userId: 'bob' }],
    ['a time that is no time', { availability: 'busy', text: null, clearsAt: 'tomorrow' }],
    ['no body', undefined],
  ])('refuses %s', (_, given) => {
    expect(refusal(given)).toMatchObject({ status: 400, slug: 'invalid-status' })
  })
})
