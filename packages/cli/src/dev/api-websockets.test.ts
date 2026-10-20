import { describe, expect, it } from 'vitest'
import { isApiWebSocket } from './api-websockets'

describe('isApiWebSocket', () => {
  it('takes realtime sockets and leaves the rest to Vite', () => {
    expect(isApiWebSocket('/realtime/v1/websocket?apikey=sb_publishable_x&vsn=1.0.0')).toBe(true)
    expect(isApiWebSocket('/realtime/v1/websocket')).toBe(true)
    expect(isApiWebSocket('/')).toBe(false)
    expect(isApiWebSocket('/?token=abc')).toBe(false)
    expect(isApiWebSocket('/realtime/v1/websockets')).toBe(false)
  })
})
