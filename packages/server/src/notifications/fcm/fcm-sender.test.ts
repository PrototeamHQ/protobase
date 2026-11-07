import { afterEach, describe, expect, it, vi } from 'vitest'
import type { JsonObject } from '../json-value'
import { guardedSender, PushSenderError } from '../guarded-sender'
import { PushMessageError, type PushMessage } from '../message'
import { fcmSender } from './fcm-sender'
import { fcmDevice } from './testing/fcm-device'
import { loadRecording, recordedMessage, type FcmRecording } from './testing/recordings'
import { testServiceAccount } from './testing/service-account'

const settings = testServiceAccount().settings()
const sendUrl = 'https://fcm.googleapis.com/v1/projects/example-project/messages:send'

const answerOf = (recording: FcmRecording) => () => Response.json(recording.response.body, { status: recording.response.status, headers: recording.response.headers })
const recorded = (name: string) => answerOf(loadRecording(name))

type Sent = { url: string; authorization: string | null; redirect: RequestRedirect; body: { message: Record<string, unknown> } }

// Google's token endpoint, answering the recorded token numbered by exchange, and FCM, answering each send with the
// answer `answers` gives for it, by default the stand-in 200.
const google = (answers: (sent: Sent, index: number) => Response = recorded('send-ok')) => {
  const sent: Sent[] = []
  let minted = 0
  const fetch = async (request: Request) => {
    if (request.url === 'https://oauth2.googleapis.com/token') return Response.json({ ...(loadRecording('token-ok').response.body as object), access_token: `token-${++minted}` })
    const entry = { url: request.url, authorization: request.headers.get('authorization'), redirect: request.redirect, body: await request.json() }
    sent.push(entry)
    return answers(entry, sent.length - 1)
  }
  return { sent, minted: () => minted, fetch: fetch as typeof globalThis.fetch }
}

const message: PushMessage = { title: 'Task assigned' }

afterEach(() => vi.restoreAllMocks())

describe('fcmSender', () => {
  it('sends the recorded request to the service account\'s project at FCM, with its own bearer, and answers ok', async () => {
    const service = google()
    const device = fcmDevice()
    expect(await fcmSender(settings, { fetch: service.fetch }).send(recordedMessage, [device])).toEqual([{ id: device.id, result: 'ok' }])
    const recording = loadRecording('send-ok')
    expect(service.sent).toEqual([{ url: recording.request.url, authorization: 'Bearer token-1', redirect: 'manual', body: recording.request.body }])
  })

  it('reuses one access token across a batch', async () => {
    const service = google()
    const devices = Array.from({ length: 20 }, (_, index) => fcmDevice({ id: `device-${index}`, token: `token-of-${index}` }))
    const answers = await fcmSender(settings, { fetch: service.fetch }).send(message, devices)
    expect(answers.map((answer) => answer.result)).toEqual(devices.map(() => 'ok'))
    expect(service.minted()).toBe(1)
    expect(service.sent.map((sent) => sent.body.message.token)).toEqual(devices.map((device) => device.token))
  })

  it('cannot be pointed at another device, project, host or bearer by platform.fcm', async () => {
    const service = google()
    const sender = fcmSender(settings, { fetch: service.fetch })
    const fields: JsonObject[] = [{ token: 'other' }, { name: 'projects/other/messages/1' }, { project_id: 'other' }, { url: 'https://attacker.example' }, { headers: { Authorization: 'Bearer x' } }]
    for (const fcm of fields) {
      await expect(sender.send({ title: 'Hi', platform: { fcm } }, [fcmDevice()])).rejects.toBeInstanceOf(PushMessageError)
    }
    expect(service.sent).toEqual([])
    await sender.send({ title: 'Hi', platform: { fcm: { android: { priority: 'HIGH' } } } }, [fcmDevice()])
    expect(service.sent.map(({ url, authorization, body }) => [url, authorization, body.message.token])).toEqual([[sendUrl, 'Bearer token-1', fcmDevice().token]])
  })

  it('answers gone only for the token FCM names unregistered', async () => {
    const service = google(recorded('send-unregistered'))
    expect(await fcmSender(settings, { fetch: service.fetch }).send(message, [fcmDevice()])).toEqual([{ id: 'device-1', result: 'gone' }])
  })

  it('keeps the device on every other answer: retry, never gone, and no throw', async () => {
    const answers = [
      recorded('send-invalid-argument'),
      recorded('send-permission-denied'),
      () => Response.json({ error: { code: 403, status: 'PERMISSION_DENIED', details: [{ '@type': 'type.googleapis.com/google.firebase.fcm.v1.FcmError', errorCode: 'SENDER_ID_MISMATCH' }] } }, { status: 403 }),
      () => Response.json({ error: { code: 404, status: 'NOT_FOUND', message: 'Requested entity was not found.' } }, { status: 404 }),
      () => Response.json({ error: { code: 503, status: 'UNAVAILABLE', details: [{ '@type': 'type.googleapis.com/google.firebase.fcm.v1.FcmError', errorCode: 'UNAVAILABLE' }] } }, { status: 503 }),
      () => new Response('<html>Bad Gateway</html>', { status: 502, headers: { 'content-type': 'text/html' } }),
      () => new Response('', { status: 200 }),
      () => new Response('not json', { status: 200 }),
      () => new Response(null, { status: 302, headers: { location: 'https://elsewhere.example' } }),
      () => Response.json({ error: { code: 500, status: 'INTERNAL' } }, { status: 500 }),
    ]
    for (const answer of answers) {
      const service = google(answer)
      expect(await fcmSender(settings, { fetch: service.fetch }).send(message, [fcmDevice()])).toEqual([{ id: 'device-1', result: 'retry' }])
    }
  })

  it('passes on how long FCM asks to wait', async () => {
    const service = google(() => Response.json({ error: { code: 429, status: 'RESOURCE_EXHAUSTED', details: [{ '@type': 'type.googleapis.com/google.firebase.fcm.v1.FcmError', errorCode: 'QUOTA_EXCEEDED' }] } }, { status: 429, headers: { 'retry-after': '30' } }))
    expect(await fcmSender(settings, { fetch: service.fetch }).send(message, [fcmDevice()])).toEqual([{ id: 'device-1', result: 'retry', retryAfterSeconds: 30 }])
  })

  it('sends once more with a new access token when FCM refuses one, and retries the device when it refuses that too', async () => {
    const once = google((_, index) => (index === 0 ? recorded('send-unauthenticated')() : recorded('send-ok')()))
    expect(await fcmSender(settings, { fetch: once.fetch }).send(message, [fcmDevice()])).toEqual([{ id: 'device-1', result: 'ok' }])
    expect(once.sent.map((sent) => sent.authorization)).toEqual(['Bearer token-1', 'Bearer token-2'])

    const always = google(recorded('send-unauthenticated'))
    expect(await fcmSender(settings, { fetch: always.fetch }).send(message, [fcmDevice()])).toEqual([{ id: 'device-1', result: 'retry' }])
    expect(always.sent).toHaveLength(2)
  })

  it('retries a device whose answer does not come', async () => {
    const timeout = (async () => {
      throw new DOMException('The operation timed out.', 'TimeoutError')
    }) as typeof fetch
    const service = google()
    const fetch = (async (request: Request) => (request.url.includes('/messages:send') ? timeout(request) : service.fetch(request))) as typeof globalThis.fetch
    expect(await fcmSender(settings, { fetch }).send(message, [fcmDevice()])).toEqual([{ id: 'device-1', result: 'retry' }])
  })

  it('refuses a device whose token is no FCM token, with no request', async () => {
    const service = google()
    const devices = [fcmDevice({ id: 'bad', token: 'https://push.example/x' }), fcmDevice({ id: 'good' })]
    expect(await fcmSender(settings, { fetch: service.fetch }).send(message, devices)).toEqual([{ id: 'bad', result: 'refused' }, { id: 'good', result: 'ok' }])
    expect(service.sent).toHaveLength(1)
  })

  it('throws for a device of another kind', async () => {
    await expect(fcmSender(settings, { fetch: google().fetch }).send(message, [fcmDevice({ kind: 'web' })])).rejects.toThrow('not an fcm device')
  })

  it('throws without a secret when no access token can be minted, which the guard names by index alone', async () => {
    const fetch = (async () => Response.json({ error: 'invalid_grant', error_description: 'Invalid JWT Signature.', access_token: 'leaked-token' }, { status: 400 })) as typeof globalThis.fetch
    const sender = fcmSender(settings, { fetch })
    const error = (await sender.send(message, [fcmDevice()]).catch((caught: Error) => caught)) as Error
    expect(error.message).toBe('The FCM token exchange failed with status 400')
    await expect(guardedSender(sender, 0).send(message, [fcmDevice()])).rejects.toBeInstanceOf(PushSenderError)
  })

  it('logs nothing, sent or failed', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((level) => vi.spyOn(console, level))
    await fcmSender(settings, { fetch: google().fetch }).send(message, [fcmDevice()])
    await fcmSender(settings, { fetch: google(recorded('send-permission-denied')).fetch }).send(message, [fcmDevice()])
    await fcmSender(settings, { fetch: (async () => new Response(null, { status: 500 })) as typeof fetch }).send(message, [fcmDevice()]).catch(() => {})
    for (const spy of spies) expect(spy).not.toHaveBeenCalled()
  })
})
