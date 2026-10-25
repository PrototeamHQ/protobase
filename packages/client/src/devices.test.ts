import { describe, expect, it } from 'vitest'
import { createClient } from './client'
import { ApiError } from './problem'

const device = { kind: 'web' as const, endpoint: 'https://fcm.googleapis.com/fcm/send/x', keys: { p256dh: 'p', auth: 'a' }, userId: 'alice' }

describe('devices', () => {
  it('registers the device in the body, beside the API, and removes one by its id in the path', async () => {
    const calls: { url: string; init: RequestInit }[] = []
    const fetch = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
      calls.push({ url: String(input), init })
      return init.method === 'DELETE' ? new Response(null, { status: 204 }) : Response.json({ id: 'd1', kind: 'web', createdAt: 'x', lastSeenAt: 'x' })
    }) as typeof globalThis.fetch
    const client = createClient({ fetch, baseUrl: 'https://app.example/api/v1', token: async () => 'token' })
    expect(await client.devices.register(device)).toEqual({ id: 'd1', kind: 'web', createdAt: 'x', lastSeenAt: 'x' })
    await client.devices.remove('d/1')
    expect(calls.map((call) => [call.init.method, call.url])).toEqual([
      ['POST', 'https://app.example/api/notifications/devices'],
      ['DELETE', 'https://app.example/api/notifications/devices/d%2F1'],
    ])
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual(device)
    expect(calls[0]!.init.headers).toMatchObject({ authorization: 'Bearer token' })
  })

  it('rejects a refused register with its problem slug', async () => {
    const fetch = (async () => new Response(JSON.stringify({ type: 'urn:protobase:problem:device-held', title: 'Conflict', status: 409 }), { status: 409, headers: { 'content-type': 'application/problem+json' } })) as typeof globalThis.fetch
    const error = await createClient({ fetch }).devices.register(device).catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).slug).toBe('device-held')
  })
})
