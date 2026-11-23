import { describe, expect, it } from 'vitest'
import { refuseInherited } from './realtime-members-schema'

describe('refuseInherited', () => {
  it('passes no table and refuses partitions and inheriting tables, naming them', () => {
    expect(() => refuseInherited([])).not.toThrow()
    expect(() => refuseInherited(['"rooms_a"'])).toThrow('realtime.members cannot keep the members of "rooms_a": a partition or a table in an inheritance tree')
  })
})
