import { afterEach, describe, expect, it, vi } from 'vitest'
import { PushMessageError } from '../message'
import { apnsService, apnsTestDevice, apnsTestEnv, type ApnsReply, type ApnsRequest } from '../testing/apns-service'
import { apnsSender } from './apns-sender'
import { readApnsSettings } from './apns-settings'

const env = apnsTestEnv()
const settings = readApnsSettings(env)!
const now = () => 1_700_000_000_000

const closers: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const close of closers.splice(0)) await close()
  vi.restoreAllMocks()
})

const setUp = async (reply?: (request: ApnsRequest) => ApnsReply) => {
  const service = await apnsService(reply)
  closers.push(service.close)
  const sender = apnsSender(settings, { appId: 'net.example.app', connect: service.connect, now })
  return { service, sender }
}

describe('apnsSender', () => {
  it('posts the message to the device token with the topic, push type, priority, expiration and payload', async () => {
    const { service, sender } = await setUp()
    const device = apnsTestDevice()
    const answers = await sender.send({ title: 'Hi', body: 'There', url: 'https://example.com/a', tag: 'order-1', ttl: 60, urgency: 'high' }, [device])
    expect(answers).toEqual([{ id: device.id, result: 'ok' }])
    const [request] = service.requests
    expect(request!.origin).toBe('https://api.sandbox.push.apple.com')
    expect(request!.headers).toMatchObject({
      ':method': 'POST',
      ':path': `/3/device/${device.token}`,
      'apns-topic': 'net.example.app',
      'apns-push-type': 'alert',
      'apns-priority': '10',
      'apns-expiration': '1700000060',
      'apns-collapse-id': 'order-1',
      'content-type': 'application/json',
    })
    expect(request!.headers.authorization).toMatch(/^bearer [\w-]+\.[\w-]+\.[\w-]+$/)
    expect(JSON.parse(request!.body)).toEqual({ aps: { alert: { title: 'Hi', body: 'There' } }, url: 'https://example.com/a', user: 'user' })
  })

  it('sends a sandbox device to the sandbox and a production device to production', async () => {
    const { service, sender } = await setUp()
    await sender.send({ title: 'Hi' }, [apnsTestDevice({ environment: 'sandbox' }), apnsTestDevice({ environment: 'production' })])
    expect(service.requests.map((request) => request.origin).sort()).toEqual(['https://api.push.apple.com', 'https://api.sandbox.push.apple.com'])
  })

  it('keeps platform.apns in the JSON body, never in the headers', async () => {
    const { service, sender } = await setUp()
    const apns = { 'apns-topic': 'com.other.app', 'apns-push-type': 'background', 'apns-priority': '1', authorization: 'bearer x', ':path': '/3/device/other', host: 'evil.example' }
    await sender.send({ title: 'Hi', platform: { apns } }, [apnsTestDevice()])
    const [request] = service.requests
    expect(request!.headers).toMatchObject({ 'apns-topic': 'net.example.app', 'apns-push-type': 'alert', 'apns-priority': '10', ':path': expect.stringMatching(/^\/3\/device\/a+\d+$/) })
    expect(request!.headers.host).toBeUndefined()
    expect(request!.headers.authorization).not.toBe('bearer x')
    expect(JSON.parse(request!.body)).toMatchObject(apns)
  })

  it.each(['a'.repeat(63) + '/', 'a'.repeat(63) + '?', 'a'.repeat(32) + ' ' + 'a'.repeat(31), 'a'.repeat(62) + '\r\n', 'A'.repeat(64), 'g'.repeat(64), '../'.repeat(22), 'a'.repeat(63)])('refuses a token %j with no request', async (token) => {
    const { service, sender } = await setUp()
    const device = apnsTestDevice({ token })
    expect(await sender.send({ title: 'Hi' }, [device])).toEqual([{ id: device.id, result: 'refused' }])
    expect(service.requests).toEqual([])
    expect(service.origins).toEqual([])
  })

  it.each(['staging', '__proto__', 'evil.example', null])('refuses an environment %j with no request, only ever opening the two origins', async (environment) => {
    const { service, sender } = await setUp()
    const device = apnsTestDevice({ environment: environment as never })
    expect(await sender.send({ title: 'Hi' }, [device])).toEqual([{ id: device.id, result: 'refused' }])
    expect(service.origins).toEqual([])
  })

  it('refuses a device of another app with no request', async () => {
    const { service, sender } = await setUp()
    const device = apnsTestDevice({ appId: 'com.other.app' })
    expect(await sender.send({ title: 'Hi' }, [device])).toEqual([{ id: device.id, result: 'refused' }])
    expect(service.requests).toEqual([])
  })

  it('answers each device for itself, in a batch over the concurrency, whatever order APNs answers in', async () => {
    const results = ['ok', 'gone', 'refused', 'retry'] as const
    const devices = Array.from({ length: 20 }, (_, index) => {
      const result = results[index % 4]!
      return { device: apnsTestDevice(result === 'refused' ? { environment: 'staging' as never } : {}), result }
    })
    const wanted = new Map(devices.map(({ device, result }) => [`/3/device/${device.token}`, result]))
    const { sender } = await setUp((request) => {
      const result = wanted.get(String(request.headers[':path']))
      const delayMs = Math.floor(Math.random() * 30)
      if (result === 'gone') return { status: 410, reason: 'Unregistered', delayMs }
      if (result === 'retry') return { status: 503, reason: 'ServiceUnavailable', delayMs }
      return { status: 200, delayMs }
    })
    const answers = await sender.send({ title: 'Hi' }, devices.map(({ device }) => device))
    expect(answers).toEqual(devices.map(({ device, result }) => ({ id: device.id, result })))
  })

  it('maps 400 BadDeviceToken to gone and another 400 to retry', async () => {
    const gone = apnsTestDevice()
    const { sender } = await setUp((request) => ({ status: 400, reason: request.headers[':path'] === `/3/device/${gone.token}` ? 'BadDeviceToken' : 'BadTopic' }))
    const other = apnsTestDevice()
    expect(await sender.send({ title: 'Hi' }, [gone, other])).toEqual([{ id: gone.id, result: 'gone' }, { id: other.id, result: 'retry' }])
  })

  it('signs a new provider token after APNs says it expired', async () => {
    let first = true
    const { service, sender } = await setUp(() => {
      if (!first) return { status: 200 }
      first = false
      return { status: 403, reason: 'ExpiredProviderToken' }
    })
    await sender.send({ title: 'Hi' }, [apnsTestDevice()])
    await sender.send({ title: 'Hi' }, [apnsTestDevice()])
    const [a, b] = service.requests.map((request) => request.headers.authorization)
    expect(a).not.toBe(b)
  })

  it('puts neither the key nor the provider token in an answer, an error or the console', async () => {
    const log = (['log', 'info', 'warn', 'error', 'debug'] as const).map((name) => vi.spyOn(console, name))
    const keyLine = env.PROTOBASE_APNS_KEY.split('\n')[1]!
    for (const reply of [{ status: 403, reason: 'InvalidProviderToken' }, { status: 500, reason: 'InternalServerError' }]) {
      const { service, sender } = await setUp(() => reply)
      const answers = await sender.send({ title: 'Hi' }, [apnsTestDevice()])
      const token = String(service.requests[0]!.headers.authorization).slice('bearer '.length)
      const text = JSON.stringify(answers)
      expect(text).not.toContain(token)
      expect(text).not.toContain(keyLine)
      expect(answers[0]!.result).toBe('retry')
    }
    for (const spy of log) expect(spy).not.toHaveBeenCalled()
  })

  it('refuses a payload over 4096 bytes before any request', async () => {
    const { service, sender } = await setUp()
    await expect(sender.send({ title: 'Hi', data: { text: 'x'.repeat(4100) } }, [apnsTestDevice()])).rejects.toThrow(PushMessageError)
    expect(service.requests).toEqual([])
  })

  it('refuses a message pushMessage refuses, and a device of another kind', async () => {
    const { sender } = await setUp()
    await expect(sender.send({ title: 'Hi', tag: 'a\r\nb' }, [apnsTestDevice()])).rejects.toThrow(new PushMessageError('tag'))
    await expect(sender.send({ title: 'Hi' }, [apnsTestDevice({ kind: 'web' })])).rejects.toThrow('not an apns device')
  })

  it('needs the mobile app id', () => {
    expect(() => apnsSender(settings, { appId: '' })).toThrow('mobile.appId')
    expect(() => apnsSender(settings, { appId: 'a/b' })).toThrow('mobile.appId')
  })
})
