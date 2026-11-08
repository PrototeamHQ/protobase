import { describe, expect, it } from 'vitest'
import type { Device } from '../device'
import { PushMessageError, type PushMessage } from '../message'
import { maxRelayDevices, relaySendRequest, type RelaySendAnswer } from './relay-protocol'
import { relaySender } from './relay-sender'
import type { RelaySettings } from './relay-settings'

const settings: RelaySettings = { url: new URL('https://relay.example.com/v1/'), credential: 'relay-credential-0123456789' }

const relayDevice = (n: number, change: Partial<Device> = {}): Device => ({
  id: `device-${n}`,
  userId: `user-${n}`,
  kind: 'relay',
  token: `relay-handle-${n}`.padEnd(24, '0'),
  p256dh: null,
  auth: null,
  environment: null,
  appId: null,
  userAgent: null,
  sessionId: null,
  createdAt: new Date(0),
  lastSeenAt: new Date(0),
  ...change,
})

type Sent = { method: string; url: string; headers: Record<string, string>; redirect: RequestRedirect; body: unknown }

// A relay answering each send with what `answer` gives for it, by default `ok` for every handle.
const relay = (answer: (sent: Sent) => Response = (sent) => Response.json({ results: (sent.body as { devices: { handle: string }[] }).devices.map(({ handle }) => ({ handle, result: 'ok' })) } satisfies RelaySendAnswer)) => {
  const sent: Sent[] = []
  const fetch = async (request: Request) => {
    const entry = { method: request.method, url: request.url, headers: Object.fromEntries(request.headers), redirect: request.redirect, body: await request.json() }
    sent.push(entry)
    return answer(entry)
  }
  return { sent, fetch: fetch as typeof globalThis.fetch }
}

const message: PushMessage = { title: 'Task assigned', body: 'Review the launch plan', url: 'https://app.example.com/tasks/42', tag: 'task-42' }

const snapshot = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`

describe('relaySender', () => {
  it('posts the message and each handle with its user to <relay>/send, with the credential as bearer, and answers ok', async () => {
    const service = relay()
    const devices = [relayDevice(1), relayDevice(2)]
    expect(await relaySender(settings, { fetch: service.fetch }).send(message, devices)).toEqual([
      { id: 'device-1', result: 'ok' },
      { id: 'device-2', result: 'ok' },
    ])
    expect(service.sent).toHaveLength(1)
    expect(relaySendRequest.safeParse(service.sent[0]!.body).success).toBe(true)
    await expect(snapshot(service.sent[0])).toMatchFileSnapshot('./snapshots/send-request.json')
  })

  it('removes the device of a handle the relay answers gone, and keeps the others', async () => {
    const gone = relayDevice(2)
    const service = relay(() => Response.json({ results: [{ handle: relayDevice(1).token, result: 'ok' }, { handle: gone.token, result: 'gone' }] }))
    expect(await relaySender(settings, { fetch: service.fetch }).send(message, [relayDevice(1), gone])).toEqual([
      { id: 'device-1', result: 'ok' },
      { id: 'device-2', result: 'gone' },
    ])
    await expect(snapshot(service.sent[0])).toMatchFileSnapshot('./snapshots/send-request-gone.json')
  })

  it('retries a handle the relay does not answer, and ignores answers for handles it was not sent', async () => {
    const service = relay(() => Response.json({ results: [{ handle: 'someone-elses-handle-000', result: 'gone' }] }))
    expect(await relaySender(settings, { fetch: service.fetch }).send(message, [relayDevice(1)])).toEqual([{ id: 'device-1', result: 'retry' }])
  })

  it('retries every handle on a refusal, a server error or an answer that is not a send answer, removing none', async () => {
    const answers = [
      new Response(null, { status: 401 }),
      new Response(null, { status: 403 }),
      new Response(null, { status: 404 }),
      new Response(null, { status: 302, headers: { location: 'https://elsewhere.example' } }),
      new Response(null, { status: 503 }),
      new Response('not json', { status: 200 }),
      Response.json({ results: [{ handle: relayDevice(1).token, result: 'deleted' }] }),
    ]
    for (const answer of answers) {
      const service = relay(() => answer)
      expect(await relaySender(settings, { fetch: service.fetch }).send(message, [relayDevice(1)])).toEqual([{ id: 'device-1', result: 'retry' }])
    }
  })

  it('retries after the relay\'s Retry-After', async () => {
    const service = relay(() => new Response(null, { status: 429, headers: { 'retry-after': '30' } }))
    expect(await relaySender(settings, { fetch: service.fetch }).send(message, [relayDevice(1)])).toEqual([{ id: 'device-1', result: 'retry', retryAfterSeconds: 30 }])
  })

  it('retries when the relay cannot be reached, and names neither credential nor handle when fetch fails otherwise', async () => {
    const unreachable = (async () => {
      throw new TypeError('fetch failed')
    }) as typeof fetch
    expect(await relaySender(settings, { fetch: unreachable }).send(message, [relayDevice(1)])).toEqual([{ id: 'device-1', result: 'retry' }])
    const broken = (async () => {
      throw new Error(`${settings.credential} ${relayDevice(1).token}`)
    }) as typeof fetch
    await expect(relaySender(settings, { fetch: broken }).send(message, [relayDevice(1)])).rejects.toThrow(/^A push relay request failed unexpectedly$/)
  })

  it('sends at most maxRelayDevices handles a request, one request after another', async () => {
    const service = relay()
    const devices = Array.from({ length: maxRelayDevices + 1 }, (_, index) => relayDevice(index))
    const answers = await relaySender(settings, { fetch: service.fetch }).send(message, devices)
    expect(answers.map((answer) => answer.result)).toEqual(devices.map(() => 'ok'))
    expect(service.sent.map((sent) => (sent.body as { devices: unknown[] }).devices.length)).toEqual([maxRelayDevices, 1])
  })

  it('refuses a device whose token is no relay handle without a request', async () => {
    const service = relay()
    expect(await relaySender(settings, { fetch: service.fetch }).send(message, [relayDevice(1, { token: 'ab/cd' })])).toEqual([{ id: 'device-1', result: 'refused' }])
    expect(service.sent).toEqual([])
  })

  it('sends a device whose user id is as long as a store takes', async () => {
    const service = relay()
    const userId = 'u'.repeat(256)
    expect(await relaySender(settings, { fetch: service.fetch }).send(message, [relayDevice(1, { userId })])).toEqual([{ id: 'device-1', result: 'ok' }])
    expect(service.sent[0]!.body).toMatchObject({ devices: [{ handle: relayDevice(1).token, user: userId }] })
    expect(relaySendRequest.safeParse(service.sent[0]!.body).success).toBe(true)
  })

  it('refuses only a device whose user id no store takes, and sends the others', async () => {
    const service = relay()
    const devices = [relayDevice(1), relayDevice(2, { userId: 'u'.repeat(257) }), relayDevice(3, { userId: 'line\nbreak' })]
    expect(await relaySender(settings, { fetch: service.fetch }).send(message, devices)).toEqual([
      { id: 'device-1', result: 'ok' },
      { id: 'device-2', result: 'refused' },
      { id: 'device-3', result: 'refused' },
    ])
    expect(service.sent.map((sent) => sent.body)).toMatchObject([{ devices: [{ handle: relayDevice(1).token, user: 'user-1' }] }])
  })

  it('throws before any request for a message that is not one, or a device of another kind', async () => {
    const service = relay()
    const sender = relaySender(settings, { fetch: service.fetch })
    await expect(sender.send({ title: 'x', url: 'javascript:alert(1)' }, [relayDevice(1)])).rejects.toBeInstanceOf(PushMessageError)
    await expect(sender.send(message, [relayDevice(1, { kind: 'fcm' })])).rejects.toThrow('not a relay device')
    expect(service.sent).toEqual([])
  })
})
