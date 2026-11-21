import { describe, expect, it } from 'vitest'
import { relayClient, RelayRefusal } from './relay-commands'

const options = { url: 'https://relay.example.com/', app: 'chat', apiKey: 'k'.repeat(32) }

const recording = (status = 200, body = '{"sockets":2}') => {
  const calls: { url: string; init: RequestInit }[] = []
  const fetcher = async (url: string, init: RequestInit) => {
    calls.push({ url, init })
    return new Response(body, { status })
  }
  return { calls, client: relayClient(options, fetcher) }
}

describe('relayClient', () => {
  it("publishes with the app's API key and answers the sockets reached", async () => {
    const { calls, client } = recording()
    expect(await client.send({ kind: 'publish', id: '1:rooms/1', channel: 'rooms/1', event: 'change', payload: { kind: 'create' } })).toBe(2)
    expect(calls[0]!.url).toBe('https://relay.example.com/apps/chat/publish')
    expect(new Headers(calls[0]!.init.headers).get('authorization')).toBe(`Bearer ${'k'.repeat(32)}`)
    expect(JSON.parse(calls[0]!.init.body as string)).toEqual({ id: '1:rooms/1', channel: 'rooms/1', event: 'change', payload: { kind: 'create' } })
  })

  it('adds and removes members, and closes sessions', async () => {
    const { calls, client } = recording()
    await client.send({ kind: 'add', channel: 'conversations/7', users: ['u1'] })
    await client.send({ kind: 'remove', channel: 'conversations/7', users: ['u1'] })
    await client.closeSession('s1')
    expect(calls.map((call) => [call.url.slice('https://relay.example.com/apps/chat/'.length), JSON.parse(call.init.body as string)])).toEqual([
      ['channels/add', { channel: 'conversations/7', users: ['u1'] }],
      ['channels/remove', { channel: 'conversations/7', users: ['u1'] }],
      ['sessions/close', { session: 's1' }],
    ])
  })

  it('throws a refusal for a command the relay refuses, which sending again would not change', async () => {
    const { client } = recording(400, '{"error":"invalid_channel"}')
    await expect(client.closeSession('s1')).rejects.toBeInstanceOf(RelayRefusal)
  })

  it('throws a plain error when the relay fails otherwise, so the job tries again', async () => {
    const { client } = recording(503, '')
    const error = await client.closeSession('s1').catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(Error)
    expect(error).not.toBeInstanceOf(RelayRefusal)
  })
})
