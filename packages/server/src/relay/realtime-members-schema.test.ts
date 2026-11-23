import { describe, expect, it } from 'vitest'
import { refusePartitioned } from './realtime-members-schema'

describe('refusePartitioned', () => {
  it('passes plain tables and refuses partitioned ones, naming them', () => {
    expect(() => refusePartitioned([])).not.toThrow()
    expect(() => refusePartitioned(['"directs"'])).toThrow('realtime.members cannot keep the members of "directs": a partitioned table')
  })
})
