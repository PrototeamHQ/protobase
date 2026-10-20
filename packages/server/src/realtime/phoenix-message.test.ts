import { describe, expect, it } from 'vitest'
import { decodeMessage, encodeMessage, reply, vsnOf } from './phoenix-message'

const join = { joinRef: '1', ref: '1', topic: 'realtime:room', event: 'phx_join', payload: { config: {} } }

describe('phoenix messages', () => {
  it('reads and writes 2.0.0 arrays and 1.0.0 objects', () => {
    expect(decodeMessage('2.0.0', '["1","1","realtime:room","phx_join",{"config":{}}]')).toEqual(join)
    expect(decodeMessage('1.0.0', '{"join_ref":"1","ref":"1","topic":"realtime:room","event":"phx_join","payload":{"config":{}}}')).toEqual(join)
    expect(encodeMessage('2.0.0', reply(join, 'ok', {}))).toBe('["1","1","realtime:room","phx_reply",{"status":"ok","response":{}}]')
    expect(JSON.parse(encodeMessage('1.0.0', reply(join, 'error', { reason: 'no' })))).toEqual({ join_ref: '1', ref: '1', topic: 'realtime:room', event: 'phx_reply', payload: { status: 'error', response: { reason: 'no' } } })
  })

  it('takes a heartbeat without a join ref, and skips what is no message', () => {
    expect(decodeMessage('2.0.0', '[null,"5","phoenix","heartbeat",{}]')).toEqual({ joinRef: null, ref: '5', topic: 'phoenix', event: 'heartbeat', payload: {} })
    expect(decodeMessage('2.0.0', 'not json')).toBeUndefined()
    expect(decodeMessage('2.0.0', '["1","1","t","e"]')).toBeUndefined()
    expect(decodeMessage('1.0.0', '["1","1","t","e",{}]')).toBeUndefined()
  })

  it('speaks 2.0.0 by default and refuses other versions', () => {
    expect(vsnOf(undefined)).toBe('2.0.0')
    expect(vsnOf('1.0.0')).toBe('1.0.0')
    expect(vsnOf('3.0.0')).toBeUndefined()
  })
})
