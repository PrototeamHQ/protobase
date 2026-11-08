import { describe, expect, it } from 'vitest'
import { maxRelayDevices, relaySendAnswer } from '../notifications/relay/relay-protocol'
import { relayAnswer } from '../notifications/relay/relay-answer'
import { relayRegistrationsPerMinute, relaySendsPerHour } from './limits'
import { memoryRelayStore } from './testing/memory-relay-store'
import { recordingSender, relayApp } from './testing/relay-app'

const a = 'https://a.example.com'
const b = 'https://b.example.com'
const apnsToken = (n: number) => `${n}`.padStart(64, 'a')
const fcmToken = 'cToken0:APA91b-fcm_token'
const message = { title: 'Task assigned', url: 'https://a.example.com/tasks/1' }

const setup = (answer?: Parameters<typeof recordingSender>[1], now?: () => number) => {
  const { store, handles } = memoryRelayStore(now)
  const apns = recordingSender('apns', answer)
  const fcm = recordingSender('fcm', answer)
  return { handles, apns, fcm, ...relayApp(store, { apns: apns.sender, fcm: fcm.sender }, now) }
}

describe('POST /register', () => {
  it('answers a handle bound to the origin, the same one again for the same token and origin, and another for another origin', async () => {
    const relay = setup()
    const first = await relay.register({ kind: 'apns', token: apnsToken(1), environment: 'sandbox', origin: a })
    expect(first.handle).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(first.handle).not.toContain(apnsToken(1))
    expect(await relay.register({ kind: 'apns', token: apnsToken(1), environment: 'sandbox', origin: a })).toEqual(first)
    const other = await relay.register({ kind: 'apns', token: apnsToken(1), environment: 'sandbox', origin: b })
    expect(other.handle).not.toBe(first.handle)
    expect([...relay.handles.values()].map(({ origin }) => origin).sort()).toEqual([a, b])
  })

  it('refuses a body that is no registration, or not JSON', async () => {
    const relay = setup()
    expect((await relay.post('register', { kind: 'fcm', token: fcmToken, origin: 'http://a.example.com' })).status).toBe(400)
    const text = await relay.post('register', 'x', { 'content-type': 'text/plain' })
    expect(text.status).toBe(415)
    expect(relay.handles.size).toBe(0)
  })

  it(`takes ${relayRegistrationsPerMinute} registrations a minute from one address, then a 429 with Retry-After`, async () => {
    let at = 0
    const relay = setup(undefined, () => at)
    for (let n = 0; n < relayRegistrationsPerMinute; n += 1) expect((await relay.post('register', { kind: 'fcm', token: `${fcmToken}${n}`, origin: a })).status).toBe(200)
    const refused = await relay.post('register', { kind: 'fcm', token: fcmToken, origin: a })
    expect(refused.status).toBe(429)
    expect(refused.headers.get('retry-after')).toBe('60')
    at = 60_000
    expect((await relay.post('register', { kind: 'fcm', token: fcmToken, origin: a })).status).toBe(200)
  })
})

describe('POST /send', () => {
  it('delivers to the handles of the credential\'s origin, with that origin stamped in, and answers each', async () => {
    const relay = setup()
    const ios = await relay.register({ kind: 'apns', token: apnsToken(1), environment: 'production', origin: a })
    const android = await relay.register({ kind: 'fcm', token: fcmToken, origin: a })
    const answer = await relay.send(await relay.credentialFor(a), { message: { ...message, platform: { apns: { origin: b } } }, devices: [{ handle: ios.handle, user: 'u1' }, { handle: android.handle, user: 'u2' }] })
    expect(answer.status).toBe(200)
    const body = await answer.json()
    expect(relaySendAnswer.parse(body)).toEqual({ results: [{ handle: ios.handle, result: 'ok' }, { handle: android.handle, result: 'ok' }] })
    const [toIos] = relay.apns.sent
    expect(toIos!.message.platform?.apns?.origin).toBe(a)
    expect(toIos!.devices).toMatchObject([{ id: ios.handle, userId: 'u1', kind: 'apns', token: apnsToken(1), environment: 'production', appId: 'net.example.app' }])
    expect(relay.fcm.sent[0]!.message.platform?.fcm?.data).toEqual({ origin: a })
    expect(relay.fcm.sent[0]!.devices).toMatchObject([{ id: android.handle, userId: 'u2', token: fcmToken }])
  })

  it('refuses a handle of another origin and an unknown one, sending them nothing', async () => {
    const relay = setup()
    const theirs = await relay.register({ kind: 'apns', token: apnsToken(1), environment: 'sandbox', origin: b })
    const unknown = 'u'.repeat(43)
    const answer = await relay.send(await relay.credentialFor(a), { message, devices: [{ handle: theirs.handle, user: 'u1' }, { handle: unknown, user: 'u1' }] })
    expect(await answer.json()).toEqual({ results: [{ handle: theirs.handle, result: 'refused' }, { handle: unknown, result: 'refused' }] })
    expect(relay.apns.sent).toEqual([])
  })

  it('answers 401 for no credential, a malformed one, an unknown one and a wrong secret, and the sender retries', async () => {
    const relay = setup()
    const { handle } = await relay.register({ kind: 'fcm', token: fcmToken, origin: a })
    const real = await relay.credentialFor(a)
    const body = { message, devices: [{ handle, user: 'u1' }] }
    const wrongSecret = `${real.slice(0, -1)}${real.endsWith('A') ? 'B' : 'A'}`
    const unknown = `00000000-0000-4000-8000-000000000000.${real.split('.')[1]}`
    for (const credential of ['', 'nonsense-credential', unknown, wrongSecret]) {
      const answer = await relay.send(credential, body)
      expect(answer.status).toBe(401)
      const text = await answer.text()
      expect(text).not.toContain(real.split('.')[1])
      expect(relayAnswer(answer, text, [handle]).get(handle)).toEqual({ result: 'retry' })
    }
    expect((await relay.post('send', body)).status).toBe(401)
    expect(relay.fcm.sent).toEqual([])
  })

  it('removes a handle whose token is gone and answers gone, keeping the token\'s handles of other origins', async () => {
    const relay = setup((device) => (device.token === apnsToken(1) ? 'gone' : 'ok'))
    const gone = await relay.register({ kind: 'apns', token: apnsToken(1), environment: 'sandbox', origin: a })
    const kept = await relay.register({ kind: 'apns', token: apnsToken(2), environment: 'sandbox', origin: a })
    const elsewhere = await relay.register({ kind: 'apns', token: apnsToken(1), environment: 'sandbox', origin: b })
    const answer = await relay.send(await relay.credentialFor(a), { message, devices: [{ handle: gone.handle, user: 'u1' }, { handle: kept.handle, user: 'u1' }] })
    expect(await answer.json()).toEqual({ results: [{ handle: gone.handle, result: 'gone' }, { handle: kept.handle, result: 'ok' }] })
    expect([...relay.handles.keys()].sort()).toEqual([kept.handle, elsewhere.handle].sort())
  })

  it('passes retry and refused through, and sends a handle named twice once', async () => {
    const relay = setup((device) => (device.kind === 'apns' ? 'retry' : 'refused'))
    const ios = await relay.register({ kind: 'apns', token: apnsToken(1), environment: 'sandbox', origin: a })
    const android = await relay.register({ kind: 'fcm', token: fcmToken, origin: a })
    const answer = await relay.send(await relay.credentialFor(a), { message, devices: [{ handle: ios.handle, user: 'u1' }, { handle: ios.handle, user: 'u1' }, { handle: android.handle, user: 'u1' }] })
    expect(await answer.json()).toEqual({ results: [{ handle: ios.handle, result: 'retry' }, { handle: android.handle, result: 'refused' }] })
    expect(relay.apns.sent[0]!.devices).toHaveLength(1)
  })

  it('refuses a handle of a kind the relay has no keys for', async () => {
    const { store } = memoryRelayStore()
    const apns = recordingSender('apns')
    const relay = relayApp(store, { apns: apns.sender })
    const { handle } = await relay.register({ kind: 'fcm', token: fcmToken, origin: a })
    expect(await (await relay.send(await relay.credentialFor(a), { message, devices: [{ handle, user: 'u1' }] })).json()).toEqual({ results: [{ handle, result: 'refused' }] })
  })

  it('refuses a send that is not one, or whose message is not one, with a 400 sending nothing', async () => {
    const relay = setup()
    const { handle } = await relay.register({ kind: 'fcm', token: fcmToken, origin: a })
    const credential = await relay.credentialFor(a)
    for (const body of [{ message, devices: [] }, { message, devices: [{ handle: 'no/handle', user: 'u1' }] }, { message: { title: 'x', url: 'javascript:alert(1)' }, devices: [{ handle, user: 'u1' }] }, { message, devices: [{ handle, user: 'u1' }], origin: b }]) {
      expect((await relay.send(credential, body)).status).toBe(400)
    }
    expect(relay.fcm.sent).toEqual([])
  })

  it(`sends to at most ${relaySendsPerHour} devices per credential in a clock hour, then a 429 with Retry-After until the next hour`, async () => {
    let at = Date.UTC(2026, 10, 8, 10, 59, 30)
    const relay = setup(undefined, () => at)
    const { handle } = await relay.register({ kind: 'fcm', token: fcmToken, origin: a })
    const credential = await relay.credentialFor(a)
    const other = await relay.credentialFor(a)
    const full = { message, devices: Array.from({ length: maxRelayDevices }, () => ({ handle, user: 'u1' })) }
    for (let sent = 0; sent < relaySendsPerHour; sent += maxRelayDevices) expect((await relay.send(credential, full)).status).toBe(200)
    const refused = await relay.send(credential, { message, devices: [{ handle, user: 'u1' }] })
    expect(refused.status).toBe(429)
    expect(refused.headers.get('retry-after')).toBe('30')
    expect(relayAnswer(refused, await refused.text(), [handle]).get(handle)).toEqual({ result: 'retry', retryAfterSeconds: 30 })
    expect((await relay.send(other, { message, devices: [{ handle, user: 'u1' }] })).status).toBe(200)
    at += 30_000
    expect((await relay.send(credential, { message, devices: [{ handle, user: 'u1' }] })).status).toBe(200)
  })
})
