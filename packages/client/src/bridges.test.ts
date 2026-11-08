import { describe, expect, it } from 'vitest'
import type { SocketLike } from './channel-connection'
import { createClient } from './client'
import { ApiError } from './problem'

describe('bridges', () => {
  it('asks the bridge function for a token, then opens its socket with it, binary as ArrayBuffers', async () => {
    const calls: { url: string; init: RequestInit }[] = []
    const fetch = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
      calls.push({ url: String(input), init })
      return Response.json({ token: 't+1', open_by: '2026-11-08T10:00:30.000Z', expires_at: '2026-11-08T11:00:00.000Z' }, { status: 201 })
    }) as typeof globalThis.fetch
    const opened: string[] = []
    const socket = { binaryType: 'blob' } as SocketLike
    const webSocket = (url: string) => (opened.push(url), socket)
    const client = createClient({ fetch, baseUrl: 'https://app.example/api/v1', webSocket })
    const bridge = await client.bridges.open('console', 'vm-42')
    expect(calls.map((call) => [call.init.method, call.url])).toEqual([['POST', 'https://app.example/api/functions/console']])
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual({ target: 'vm-42' })
    expect(opened).toEqual(['wss://app.example/api/functions/console?token=t%2B1'])
    expect(bridge.socket).toBe(socket)
    expect(socket.binaryType).toBe('arraybuffer')
    expect(bridge.expiresAt).toEqual(new Date('2026-11-08T11:00:00.000Z'))
  })

  it('opens no socket for a target the caller may not reach', async () => {
    const fetch = (async () => new Response(JSON.stringify({ type: 'urn:protobase:problem:not-found', title: 'Not Found', status: 404 }), { status: 404, headers: { 'content-type': 'application/problem+json' } })) as typeof globalThis.fetch
    const opened: string[] = []
    const client = createClient({ fetch, webSocket: (url) => (opened.push(url), {} as SocketLike) })
    const error = await client.bridges.open('console', 'vm-42').catch((caught: unknown) => caught)
    expect((error as ApiError).status).toBe(404)
    expect(opened).toEqual([])
  })
})
