import { describe, expect, it } from 'vitest'
import { relayed, type RealtimeOptions } from './realtime-options'

describe('relayed', () => {
  it('relays for many processes only, and refuses another value', () => {
    expect([relayed(), relayed({ processes: 'one' }), relayed({ processes: 'many' })]).toEqual([false, false, true])
    expect(() => relayed({ processes: 'several' } as unknown as RealtimeOptions)).toThrow('Invalid realtime.processes "several": use "one" or "many"')
  })
})
