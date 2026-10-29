import { describe, expect, it } from 'vitest'
import { markPeople } from './mark-people'

const busy = { userId: 'u-ann', availability: 'busy', text: 'Having lunch', clearsAt: null } as const

describe('markPeople', () => {
  it('gives a mark that names a person their presence and status', () => {
    expect(markPeople({ dm: { strong: true, person: 'u-ann' } }, { 'u-ann': 'online' }, [busy])).toEqual({ dm: { strong: true, person: { status: busy, presence: 'online' } } })
  })

  it('leaves out what the app gives none for, such as someone with no page open', () => {
    expect(markPeople({ dm: { person: 'u-bo' } }, { 'u-ann': 'online' }, [busy])).toEqual({ dm: { person: {} } })
    expect(markPeople({ dm: { person: 'u-ann' } }, undefined, undefined)).toEqual({ dm: { person: {} } })
  })

  it('reads only presence of its own, not what an object inherits', () => {
    expect(markPeople({ dm: { person: 'toString' } }, {}, [])).toEqual({ dm: { person: {} } })
  })

  it('keeps marks that name no one as they are, and none while they load', () => {
    expect(markPeople({ general: { count: 3, label: '3 mentions' } }, { 'u-ann': 'away' }, [busy])).toEqual({ general: { count: 3, label: '3 mentions' } })
    expect(markPeople(undefined, { 'u-ann': 'away' }, [busy])).toBeUndefined()
  })
})
