import { readFileSync } from 'node:fs'
import { createServer as createHttpServer, type Server } from 'node:http'
import { createServer as createHttpsServer } from 'node:https'
import { createServer as createTcpServer, type AddressInfo, type Server as TcpServer } from 'node:net'
import { afterAll, describe, expect, it } from 'vitest'
import { webPushReceiver } from '../../packages/server/src/notifications/testing/web-push-receiver'
import { encryptPayload } from '../../packages/server/src/notifications/web-push/encrypt'
import { generateVapidKeys } from '../../packages/server/src/notifications/web-push/keys'
import { postPush } from '../../packages/server/src/notifications/web-push/post'
import { readVapidSettings } from '../../packages/server/src/notifications/web-push/vapid-settings'
import { webPushSender } from '../../packages/server/src/notifications/web-push/web-push-sender'

const runtime = process.versions.bun ? 'Bun' : 'Node'
// A self-signed certificate for another host, as a push service an attacker stands in for would present.
const tls = {
  key: readFileSync(new URL('../../packages/server/tests/support/saml-idp.key', import.meta.url)),
  cert: readFileSync(new URL('../../packages/server/tests/support/saml-idp.crt', import.meta.url)),
}

const servers: (Server | TcpServer)[] = []
const listening = async <T extends Server | TcpServer>(server: T) => {
  servers.push(server)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  return (server.address() as AddressInfo).port
}
afterAll(() => {
  for (const server of servers) {
    if ('closeAllConnections' in server) server.closeAllConnections()
    server.close()
  }
})

const devicePath = '/push/secret-device-path'
const headers = { TTL: '60', 'Content-Encoding': 'aes128gcm', Authorization: 'vapid t=secret.jwt.value, k=key' }
const body = () => new Uint8Array(32)

// What a caller could log of the answer or the error: neither may name the device's URL or the token.
const exposed = (outcome: unknown) => JSON.stringify(outcome instanceof Error ? { ...outcome, message: outcome.message, cause: outcome.cause } : outcome)
const settle = (url: string, timeoutMs?: number) => postPush(new URL(url), headers, body(), timeoutMs === undefined ? {} : { timeoutMs }).catch((error: unknown) => error)

// The fetch of the runtime that runs this test (`bun run test:smoke` or `node --run test:smoke`), as the sender uses it.
describe(`a Web Push request on ${runtime}'s fetch`, () => {
  it('answers what a push service answers', async () => {
    const port = await listening(createHttpServer((request, response) => {
      response.writeHead(request.url?.endsWith('gone') ? 410 : 201).end()
    }))
    expect(await settle(`http://127.0.0.1:${port}${devicePath}`)).toEqual({ result: 'ok' })
    expect(await settle(`http://127.0.0.1:${port}${devicePath}/gone`)).toEqual({ result: 'gone' })
  })

  it.each([301, 302, 307, 308])('follows no %i redirect, so the token reaches no other host', async (status) => {
    let elsewhere = 0
    const otherPort = await listening(createHttpServer((_request, response) => {
      elsewhere++
      response.writeHead(201).end()
    }))
    let asked = 0
    const port = await listening(createHttpServer((_request, response) => {
      asked++
      response.writeHead(status, { Location: `http://127.0.0.1:${otherPort}/metadata` }).end()
    }))
    const outcome = await settle(`http://127.0.0.1:${port}${devicePath}`)
    expect(outcome).toEqual({ result: 'retry' })
    expect(asked).toBe(1)
    expect(elsewhere).toBe(0)
  })

  it('answers retry for a connection reset', async () => {
    const port = await listening(createTcpServer((socket) => socket.resetAndDestroy()))
    const outcome = await settle(`http://127.0.0.1:${port}${devicePath}`)
    expect(outcome).toEqual({ result: 'retry' })
    expect(exposed(outcome)).not.toContain('secret')
  })

  it('answers retry for a refused connection', async () => {
    const server = createTcpServer()
    const port = await listening(server)
    await new Promise((resolve) => server.close(resolve))
    expect(await settle(`http://127.0.0.1:${port}${devicePath}`)).toEqual({ result: 'retry' })
  })

  it('answers retry for a self-signed certificate for another host, sending nothing', async () => {
    let asked = 0
    const port = await listening(createHttpsServer(tls, (_request, response) => {
      asked++
      response.writeHead(201).end()
    }))
    const outcome = await settle(`https://127.0.0.1:${port}${devicePath}`)
    expect(outcome).toEqual({ result: 'retry' })
    expect(asked).toBe(0)
    expect(exposed(outcome)).not.toContain('secret')
  })

  it('answers retry when the push service never answers', async () => {
    const port = await listening(createHttpServer(() => {}))
    expect(await settle(`http://127.0.0.1:${port}${devicePath}`, 300)).toEqual({ result: 'retry' })
  })
})

// The sender's crypto on the runtime that runs this test: the VAPID signature as WebCrypto verifies it, and the body as
// RFC 8291's worked example and a browser decrypt it.
describe(`the Web Push sender's crypto on ${runtime}`, () => {
  it('signs a token WebCrypto verifies with the configured key, and encrypts a body the device decrypts', async () => {
    const keys = generateVapidKeys()
    const settings = readVapidSettings({ PROTOBASE_VAPID_PUBLIC_KEY: keys.publicKey, PROTOBASE_VAPID_PRIVATE_KEY: keys.privateKey, PROTOBASE_VAPID_SUBJECT: 'mailto:admin@example.com' })!
    const receiver = webPushReceiver()
    const sent: Request[] = []
    const fetch = async (request: Request) => {
      sent.push(request)
      return new Response(null, { status: 201 })
    }
    const device = { id: 'd', userId: 'u', kind: 'web' as const, token: 'https://fcm.googleapis.com/fcm/send/x', p256dh: receiver.p256dh, auth: receiver.auth, environment: null, appId: null, userAgent: null, createdAt: new Date(), lastSeenAt: new Date() }
    expect(await webPushSender(settings, { fetch: fetch as typeof globalThis.fetch }).send({ title: 'Hello' }, [device])).toEqual([{ id: 'd', result: 'ok' }])

    const [, token, key] = /^vapid t=([^,]+), k=(.+)$/.exec(sent[0]!.headers.get('authorization')!)!
    const [head, claims, signature] = token!.split('.')
    const publicKey = await crypto.subtle.importKey('raw', Buffer.from(key!, 'base64url'), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify'])
    expect(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, publicKey, Buffer.from(signature!, 'base64url'), new TextEncoder().encode(`${head}.${claims}`))).toBe(true)
    expect(JSON.parse(Buffer.from(claims!, 'base64url').toString()).aud).toBe('https://fcm.googleapis.com')
    expect(JSON.parse(receiver.decrypt(new Uint8Array(await sent[0]!.arrayBuffer())))).toEqual({ title: 'Hello' })
  })

  it("reproduces RFC 8291's worked example", async () => {
    const { createECDH } = await import('node:crypto')
    const b64 = (text: string) => Buffer.from(text, 'base64url')
    const ecdh = createECDH('prime256v1')
    ecdh.setPrivateKey(b64('yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw'))
    const encrypted = encryptPayload(b64('V2hlbiBJIGdyb3cgdXAsIEkgd2FudCB0byBiZSBhIHdhdGVybWVsb24'), { p256dh: b64('BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4'), auth: b64('BTBZMqHH6r4Tts7J_aSIgg') }, { salt: b64('DGv6ra1nlYgDCS1FRnbzlw'), ecdh })
    expect(encrypted.toString('base64url')).toBe('DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN')
  })
})
