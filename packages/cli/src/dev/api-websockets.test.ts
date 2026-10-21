import type { IncomingMessage } from 'node:http'
import type { Duplex } from 'node:stream'
import { describe, expect, it, vi } from 'vitest'
import { apiUpgrades, isApiWebSocket } from './api-websockets'

describe('isApiWebSocket', () => {
  it('takes realtime sockets and leaves the rest to Vite', () => {
    expect(isApiWebSocket('/api/sb/realtime/v1/websocket?apikey=sb_publishable_x&vsn=1.0.0')).toBe(true)
    expect(isApiWebSocket('/api/sb/realtime/v1/websocket')).toBe(true)
    expect(isApiWebSocket('/')).toBe(false)
    expect(isApiWebSocket('/?token=abc')).toBe(false)
    expect(isApiWebSocket('/api/sb/realtime/v1/websockets')).toBe(false)
    expect(isApiWebSocket('/realtime/v1/websocket')).toBe(false)
  })

  it('takes the sockets of the app’s functions, below their names too', () => {
    for (const url of ['/api/functions/chat', '/api/functions/chat?ticket=x', '/api/functions/console/vm/7']) expect(isApiWebSocket(url)).toBe(true)
    for (const url of ['/api/functions', '/api/functions/', '/api/functionsx/chat', '/api/v1/tasks']) expect(isApiWebSocket(url)).toBe(false)
  })
})

describe('apiUpgrades', () => {
  const upgrade = (url: string, host: string) => {
    const socket = { end: vi.fn() }
    return { request: { url, headers: { host } } as unknown as IncomingMessage, socket: socket as unknown as Duplex & typeof socket }
  }

  it('forwards an API socket on an allowed host, one Vite added included, and refuses any other host with 403', () => {
    const forward = vi.fn()
    let hosts: true | string[] = ['dev.example.com']
    const listen = apiUpgrades(() => hosts, forward)
    for (const url of ['/api/functions/chat', '/api/sb/realtime/v1/websocket']) {
      const refused = upgrade(url, 'evil.example')
      listen(refused.request, refused.socket, Buffer.alloc(0))
      expect(refused.socket.end).toHaveBeenCalledWith('HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n')
    }
    expect(forward).not.toHaveBeenCalled()

    hosts = ['dev.example.com', 'added.example']
    for (const host of ['dev.example.com:5173', 'added.example', 'localhost:5173']) {
      const allowed = upgrade('/api/functions/chat', host)
      listen(allowed.request, allowed.socket, Buffer.alloc(0))
      expect(allowed.socket.end).not.toHaveBeenCalled()
    }
    expect(forward).toHaveBeenCalledTimes(3)
  })

  it('leaves every other upgrade to Vite, whatever its host', () => {
    const forward = vi.fn()
    const other = upgrade('/', 'evil.example')
    apiUpgrades(() => [], forward)(other.request, other.socket, Buffer.alloc(0))
    expect(forward).not.toHaveBeenCalled()
    expect(other.socket.end).not.toHaveBeenCalled()
  })
})
