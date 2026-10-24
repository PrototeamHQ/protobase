import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Device } from '../device'
import { PushMessageError, type PushMessage } from '../message'
import { webPushReceiver } from '../testing/web-push-receiver'
import { generateVapidKeys } from './keys'
import { readVapidSettings } from './vapid-settings'
import { webPushSender } from './web-push-sender'

const keys = generateVapidKeys()
const settings = readVapidSettings({ PROTOBASE_VAPID_PUBLIC_KEY: keys.publicKey, PROTOBASE_VAPID_PRIVATE_KEY: keys.privateKey, PROTOBASE_VAPID_SUBJECT: 'mailto:admin@example.com' })!

let next = 0
const deviceOf = (endpoint: string, receiver = webPushReceiver(), change: Partial<Device> = {}): Device & { receiver: typeof receiver } => ({
  id: `device-${++next}`,
  userId: 'user',
  kind: 'web',
  token: endpoint,
  p256dh: receiver.p256dh,
  auth: receiver.auth,
  environment: null,
  appId: null,
  userAgent: null,
  createdAt: new Date(),
  lastSeenAt: new Date(),
  receiver,
  ...change,
})

type Sent = { url: string; headers: Record<string, string>; body: Uint8Array }

// A push service that answers each endpoint as `status` says, by default 201, and records what it was sent.
const pushService = (status: (url: string) => number = () => 201) => {
  const sent: Sent[] = []
  const fetch = async (request: Request) => {
    sent.push({ url: request.url, headers: Object.fromEntries(request.headers), body: new Uint8Array(await request.arrayBuffer()) })
    return new Response(null, { status: status(request.url) })
  }
  return { sent, fetch: fetch as typeof globalThis.fetch }
}

const claimsOf = (authorization: string) => JSON.parse(Buffer.from(/t=([^.]+)\.([^.]+)\./.exec(authorization)![2]!, 'base64url').toString())

afterEach(() => vi.restoreAllMocks())

describe('webPushSender', () => {
  it('sends each device a VAPID-signed aes128gcm body whose headers match the message', async () => {
    const service = pushService()
    const devices = [deviceOf('https://fcm.googleapis.com/fcm/send/one'), deviceOf('https://updates.push.services.mozilla.com/wpush/v2/two')]
    const sender = webPushSender(settings, { fetch: service.fetch })
    const message: PushMessage = { title: 'Task assigned', body: 'Private body', url: 'https://app.example/tasks/1', tag: 'task-1', ttl: 600, urgency: 'high' }
    expect(await sender.send(message, devices)).toEqual(devices.map((device) => ({ id: device.id, result: 'ok' })))

    expect(service.sent.map((request) => request.url)).toEqual(devices.map((device) => device.token))
    for (const [index, request] of service.sent.entries()) {
      expect(request.headers).toMatchObject({ ttl: '600', urgency: 'high', topic: 'task-1', 'content-encoding': 'aes128gcm', 'content-type': 'application/octet-stream' })
      expect(request.headers.authorization).toMatch(new RegExp(`, k=${keys.publicKey}$`))
      expect(claimsOf(request.headers.authorization!).aud).toBe(new URL(devices[index]!.token).origin)
      expect(Buffer.from(request.body).toString('latin1')).not.toContain('Private body')
      expect(JSON.parse(devices[index]!.receiver.decrypt(request.body))).toEqual({ title: 'Task assigned', body: 'Private body', url: 'https://app.example/tasks/1', tag: 'task-1' })
    }
  })

  it('lets platform.web replace the headers built from the message', async () => {
    const service = pushService()
    const device = deviceOf('https://fcm.googleapis.com/fcm/send/one')
    await webPushSender(settings, { fetch: service.fetch }).send({ title: 'x', tag: 'a', ttl: 60, urgency: 'low', platform: { web: { ttl: 5, urgency: 'very-low', topic: 'b', payload: { title: 'y' } } } }, [device])
    expect(service.sent[0]!.headers).toMatchObject({ ttl: '5', urgency: 'very-low', topic: 'b' })
    expect(JSON.parse(device.receiver.decrypt(service.sent[0]!.body)).title).toBe('y')
  })

  it('sends only the defaults the protocol needs when the message sets none', async () => {
    const service = pushService()
    await webPushSender(settings, { fetch: service.fetch }).send({ title: 'x' }, [deviceOf('https://fcm.googleapis.com/fcm/send/one')])
    expect(service.sent[0]!.headers.ttl).toBe('2419200')
    expect(service.sent[0]!.headers).not.toHaveProperty('urgency')
    expect(service.sent[0]!.headers).not.toHaveProperty('topic')
  })

  it('answers each device from its own push service answer', async () => {
    const statuses: Record<string, number> = { a: 201, b: 410, c: 404, d: 429, e: 500 }
    const service = pushService((url) => statuses[url.slice(-1)]!)
    const devices = Object.keys(statuses).map((name) => deviceOf(`https://fcm.googleapis.com/fcm/send/${name}`))
    const answers = await webPushSender(settings, { fetch: service.fetch }).send({ title: 'x' }, devices)
    expect(answers.map((answer) => answer.result)).toEqual(['ok', 'gone', 'gone', 'retry', 'retry'])
  })

  it.each([
    'http://fcm.googleapis.com/fcm/send/x',
    'https://user:password@fcm.googleapis.com/fcm/send/x',
    'https://169.254.169.254/',
    'https://127.0.0.1/',
    'https://[::1]/',
    'https://10.0.0.5/',
    'https://localhost/',
    'https://fcm.googleapis.com.attacker.example/',
    'https://fcm.googleapis.com@attacker.example/',
    'https://fcm.googleapis.com:8443/x',
    'https://notify.windows.com/x',
    'not a url',
  ])('answers a device at %s refused with no request, sending the others', async (endpoint) => {
    const service = pushService()
    const good = deviceOf('https://web.push.apple.com/x')
    const bad = deviceOf(endpoint)
    expect(await webPushSender(settings, { fetch: service.fetch }).send({ title: 'x' }, [bad, good])).toEqual([{ id: bad.id, result: 'refused' }, { id: good.id, result: 'ok' }])
    expect(service.sent.map((request) => request.url)).toEqual([good.token])
  })

  it.each([
    ['a p256dh off the curve', { p256dh: Buffer.concat([Buffer.from([4]), Buffer.alloc(64, 1)]).toString('base64url') }],
    ['a p256dh of the wrong length', { p256dh: Buffer.alloc(33, 2).toString('base64url') }],
    ['an auth that is not 16 bytes', { auth: Buffer.alloc(8).toString('base64url') }],
    ['no p256dh', { p256dh: null }],
    ['no auth', { auth: null }],
    ['junk keys', { p256dh: '!!!', auth: '???' }],
  ])('answers a device with %s refused with no request', async (_name, change) => {
    const statuses = [201, 410]
    const service = pushService((url) => statuses[Number(url.slice(-1))]!)
    const bad = deviceOf('https://fcm.googleapis.com/fcm/send/bad', undefined, change)
    const devices = [deviceOf('https://fcm.googleapis.com/fcm/send/0'), bad, deviceOf('https://fcm.googleapis.com/fcm/send/1')]
    const answers = await webPushSender(settings, { fetch: service.fetch }).send({ title: 'x' }, devices)
    expect(answers.map((answer) => answer.result)).toEqual(['ok', 'refused', 'gone'])
    expect(service.sent).toHaveLength(2)
  })

  it.each([
    ['a javascript: url', { title: 'x', url: 'javascript:alert(1)' }],
    ['a relative url', { title: 'x', url: '/tasks/1' }],
    ['a payload url', { title: 'x', platform: { web: { payload: { url: 'javascript:alert(1)' } } } }],
    ['a payload navigate', { title: 'x', platform: { web: { payload: { notification: { navigate: 'javascript:alert(1)' } } } } }],
    ['an action navigate', { title: 'x', platform: { web: { payload: { notification: { actions: [{ navigate: '/relative' }] } } } } }],
    ['an endpoint override', { title: 'x', platform: { web: { endpoint: 'https://attacker.example/' } } }],
    ['a proxy', { title: 'x', platform: { web: { proxy: 'http://attacker.example/' } } }],
    ['an Authorization header', { title: 'x', platform: { web: { Authorization: 'x' } } }],
    ['a header with CR/LF', { title: 'x', platform: { web: { ttl: '1\r\nX: y' } } }],
    ['an unknown urgency', { title: 'x', platform: { web: { urgency: 'now' } } }],
    ['a tag with CR/LF', { title: 'x', tag: 'a\r\nb' }],
    ['a payload too large', { title: 'x', body: 'x'.repeat(2048), platform: { web: { payload: { more: 'y'.repeat(3000) } } } }],
  ])('refuses %s, a plain message, before any request', async (_name, message) => {
    const service = pushService()
    const send = webPushSender(settings, { fetch: service.fetch }).send(message as PushMessage, [deviceOf('https://fcm.googleapis.com/fcm/send/one')])
    await expect(send).rejects.toBeInstanceOf(PushMessageError)
    expect(service.sent).toHaveLength(0)
  })

  it('refuses a device of another kind before any request', async () => {
    const service = pushService()
    const devices = [deviceOf('https://fcm.googleapis.com/fcm/send/one'), deviceOf('token', undefined, { kind: 'fcm' })]
    await expect(webPushSender(settings, { fetch: service.fetch }).send({ title: 'x' }, devices)).rejects.toThrow('not a web device')
    expect(service.sent).toHaveLength(0)
  })

  it('leaks no secret to its answers, errors or logs', async () => {
    const logs = (['log', 'info', 'warn', 'error', 'debug'] as const).map((method) => vi.spyOn(console, method).mockImplementation(() => {}))
    const statuses = [400, 500]
    const fetch = async (request: Request) => {
      if (request.url.endsWith('reset')) throw Object.assign(new TypeError('socket hang up'), { path: request.url })
      if (request.url.endsWith('other')) throw Object.assign(new Error(`failed ${request.url}`), { path: request.url })
      return new Response(`error body for ${request.url}`, { status: statuses[Number(request.url.slice(-1))]! })
    }
    const devices = [deviceOf('https://fcm.googleapis.com/fcm/send/secret-path-0'), deviceOf('https://fcm.googleapis.com/fcm/send/secret-path-1'), deviceOf('https://fcm.googleapis.com/fcm/send/secret-path-reset'), deviceOf('https://fcm.googleapis.com/fcm/send/secret-path-junk', undefined, { p256dh: 'junk' })]
    const sender = webPushSender(settings, { fetch: fetch as typeof globalThis.fetch })
    const answers = await sender.send({ title: 'x' }, devices)
    const failure = await sender.send({ title: 'x' }, [deviceOf('https://fcm.googleapis.com/fcm/send/secret-path-other')]).catch((error: Error) => error)
    expect(failure).toBeInstanceOf(Error)

    const seen = JSON.stringify([answers, { ...(failure as object), message: (failure as Error).message, cause: (failure as Error).cause }, logs.map((spy) => spy.mock.calls)])
    expect(answers.map((answer) => answer.result)).toEqual(['retry', 'retry', 'retry', 'refused'])
    for (const secret of [keys.privateKey, 'secret-path', 'vapid t=', ...devices.flatMap((device) => [device.p256dh!, device.auth!])]) expect(seen).not.toContain(secret)
    for (const spy of logs) expect(spy).not.toHaveBeenCalled()
  })

  it('names its public key and delivers to web devices', () => {
    expect(webPushSender(settings)).toMatchObject({ kinds: ['web'], publicKey: keys.publicKey })
  })
})
