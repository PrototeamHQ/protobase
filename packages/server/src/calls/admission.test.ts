import { describe, expect, it } from 'vitest'
import { admission } from './admission'

describe('admission to a call', () => {
  it('lets a member in while the call has room', () => {
    expect(admission({ removed: false, present: [], member: 'ann', maxMembers: 2 })).toBeUndefined()
    expect(admission({ removed: false, present: ['bob'], member: 'ann', maxMembers: 2 })).toBeUndefined()
  })

  it('refuses one more than the limit', () => {
    expect(admission({ removed: false, present: ['bob', 'cy'], member: 'ann', maxMembers: 2 })).toBe('full')
  })

  it('lets a member already in it take their place over, also when the call is full', () => {
    expect(admission({ removed: false, present: ['ann', 'bob'], member: 'ann', maxMembers: 2 })).toBeUndefined()
  })

  it('never lets a removed member in again, also into a call with room', () => {
    expect(admission({ removed: true, present: [], member: 'ann', maxMembers: 8 })).toBe('removed')
    expect(admission({ removed: true, present: ['ann'], member: 'ann', maxMembers: 8 })).toBe('removed')
  })
})
