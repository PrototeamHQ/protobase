import { describe, expect, it } from 'vitest'
import { relayed, sqlSends, type RealtimeOptions } from './realtime-options'

describe('relayed', () => {
  it('relays for many processes only, and refuses another value', () => {
    expect([relayed(), relayed({ processes: 'one' }), relayed({ processes: 'many' })]).toEqual([false, false, true])
    expect(() => relayed({ processes: 'several' } as unknown as RealtimeOptions)).toThrow('Invalid realtime.processes "several": use "one" or "many"')
  })
})

describe('sqlSends', () => {
  it('lets SQL send only when turned on, and refuses another value', () => {
    expect([sqlSends(), sqlSends({ sqlSends: false }), sqlSends({ sqlSends: true })]).toEqual([false, false, true])
    expect(() => sqlSends({ sqlSends: 'yes' } as unknown as RealtimeOptions)).toThrow('Invalid realtime.sqlSends "yes": use true or false')
  })
})
