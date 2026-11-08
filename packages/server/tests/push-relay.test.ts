import { readFileSync } from 'node:fs'
import { Kysely } from 'kysely'
import { afterEach, describe, expect, it } from 'vitest'
import { apnsSender } from '../src/notifications/apns/apns-sender'
import { readApnsSettings } from '../src/notifications/apns/apns-settings'
import { fcmSender } from '../src/notifications/fcm/fcm-sender'
import { loadRecording } from '../src/notifications/fcm/testing/recordings'
import { testServiceAccount } from '../src/notifications/fcm/testing/service-account'
import { apnsService, apnsTestEnv } from '../src/notifications/testing/apns-service'
import { newCredential } from '../src/push-relay/credential'
import { postgresRelayStore } from '../src/push-relay/postgres-store'
import { pushRelayMigration } from '../src/push-relay/schema'
import { relayApp } from '../src/push-relay/testing/relay-app'
import { openSnapshotDb } from '../../../test-support/sql-snapshot'

// The relay on its Postgres tables, delivering through the built-in APNs and FCM senders to services that answer as
// APNs's sandbox and FCM answered when recorded (`apns/snapshots`, `fcm/testing/recordings`).
const apnsGone = JSON.parse(readFileSync(new URL('../src/notifications/apns/snapshots/device.json', import.meta.url), 'utf8')) as { response: { status: number; body: string } }
const fcmAnswer = (name: string) => loadRecording(name).response

const a = 'https://a.example.com'
const b = 'https://b.example.com'
const apnsToken = '0'.repeat(64)
// The relay's clock, fixed so the hour it counts sends in is the same in every recording.
const at = Date.UTC(2026, 10, 8, 10, 15)
const hour = new Date(Date.UTC(2026, 10, 8, 10))
const next = new Date(Date.UTC(2026, 10, 8, 11))
const fcmToken = 'cRecordingToken0:APA91b-relay'

const closers: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const close of closers.splice(0)) await close()
})

// FCM and Google's token endpoint, answering each send as the recording `send` holds.
const fcmService = (send: string) => {
  const sent: { data: Record<string, string> }[] = []
  const fetch = async (request: Request) => {
    if (request.url === 'https://oauth2.googleapis.com/token') return Response.json(loadRecording('token-ok').response.body)
    sent.push(((await request.json()) as { message: { data: Record<string, string> } }).message)
    const { status, body, headers } = fcmAnswer(send)
    return Response.json(body, { status, headers })
  }
  return { sent, fetch: fetch as typeof globalThis.fetch }
}

const open = async (apnsReply: { status: number; reason?: string }, fcmSend: string) => {
  const pg = await openSnapshotDb('empty')
  await pg.exec((await pushRelayMigration(pg.db))!)
  const db = new Kysely<any>({ dialect: pg.dialect })
  const apns = await apnsService(() => apnsReply)
  closers.push(apns.close)
  const fcm = fcmService(fcmSend)
  const senders = {
    apns: apnsSender(readApnsSettings(apnsTestEnv())!, { appId: 'net.example.app', connect: apns.connect }),
    fcm: fcmSender(testServiceAccount().settings(), { fetch: fcm.fetch }),
  }
  const relay = relayApp(postgresRelayStore(db), senders, () => at)
  const handles = async () => (await pg.query<{ handle: string }>('select handle from push_relay.handles order by handle collate "C"')).rows.map((row) => row.handle)
  return { relay, apns, fcm, handles, pg }
}

const goneReason = JSON.parse(apnsGone.response.body).reason as string

describe('the push relay on Postgres, against recorded APNs and FCM answers', () => {
  it('refuses a send with another workspace\'s credential, delivering nothing', async () => {
    const { relay, apns, fcm, handles } = await open({ status: 200 }, 'send-ok')
    const ios = await relay.register({ kind: 'apns', token: apnsToken, environment: 'sandbox', origin: a })
    const android = await relay.register({ kind: 'fcm', token: fcmToken, origin: a })
    expect(await relay.register({ kind: 'fcm', token: fcmToken, origin: a })).toEqual(android)
    const answer = await relay.send(await relay.credentialFor(b), { message: { title: 'Hi' }, devices: [{ handle: ios.handle, user: 'u1' }, { handle: android.handle, user: 'u1' }] })
    expect(await answer.json()).toEqual({ results: [{ handle: ios.handle, result: 'refused' }, { handle: android.handle, result: 'refused' }] })
    expect(apns.requests).toEqual([])
    expect(fcm.sent).toEqual([])
    expect(await handles()).toEqual([ios.handle, android.handle].sort())
  })

  it('delivers with the credential\'s origin in the payload, whatever origin the request held', async () => {
    const { relay, apns, fcm } = await open({ status: 200 }, 'send-ok')
    const ios = await relay.register({ kind: 'apns', token: apnsToken, environment: 'sandbox', origin: a })
    const android = await relay.register({ kind: 'fcm', token: fcmToken, origin: a })
    const message = { title: 'Hi', url: `${b}/steal`, data: { origin: b }, platform: { apns: { origin: b }, fcm: { data: { origin: b } } } }
    const answer = await relay.send(await relay.credentialFor(a), { message, devices: [{ handle: ios.handle, user: 'u1' }, { handle: android.handle, user: 'u2' }] })
    expect(await answer.json()).toEqual({ results: [{ handle: ios.handle, result: 'ok' }, { handle: android.handle, result: 'ok' }] })
    expect(apns.requests.map((request) => request.headers[':path'])).toEqual([`/3/device/${apnsToken}`])
    expect(JSON.parse(apns.requests[0]!.body)).toMatchObject({ origin: a, user: 'u1' })
    expect(fcm.sent.map((sent) => sent.data)).toEqual([expect.objectContaining({ origin: a, user: 'u2' })])
  })

  it('removes the handle of a token APNs or FCM reports gone, and answers gone', async () => {
    const { relay, handles, pg } = await open({ status: apnsGone.response.status, reason: goneReason }, 'send-unregistered')
    const ios = await relay.register({ kind: 'apns', token: apnsToken, environment: 'sandbox', origin: a })
    const android = await relay.register({ kind: 'fcm', token: fcmToken, origin: a })
    const elsewhere = await relay.register({ kind: 'fcm', token: fcmToken, origin: b })
    const credential = await relay.credentialFor(a)
    const devices = [{ handle: ios.handle, user: 'u1' }, { handle: android.handle, user: 'u1' }]
    expect(await (await relay.send(credential, { message: { title: 'Hi' }, devices })).json()).toEqual({ results: [{ handle: ios.handle, result: 'gone' }, { handle: android.handle, result: 'gone' }] })
    expect(await handles()).toEqual([elsewhere.handle])
    expect(await (await relay.send(credential, { message: { title: 'Hi' }, devices })).json()).toEqual({ results: [{ handle: ios.handle, result: 'refused' }, { handle: android.handle, result: 'refused' }] })
    expect((await pg.query<{ sent: number }>('select sent from push_relay.credentials')).rows).toEqual([{ sent: 4 }])
  })

  it('counts a credential\'s sends in the hour and refuses one over the limit, counting nothing', async () => {
    const pg = await openSnapshotDb('empty')
    await pg.exec((await pushRelayMigration(pg.db))!)
    const store = postgresRelayStore(new Kysely<any>({ dialect: pg.dialect }))
    const { stored } = newCredential(a)
    await store.addCredential(stored)
    expect(await store.charge(stored.id, 3, 5, hour)).toBe(true)
    expect(await store.charge(stored.id, 3, 5, hour)).toBe(false)
    expect(await store.charge(stored.id, 2, 5, hour)).toBe(true)
    expect(await store.charge(stored.id, 1, 5, hour)).toBe(false)
    expect(await store.charge(stored.id, 5, 5, next)).toBe(true)
    expect(await store.charge(stored.id, 1, 5, hour)).toBe(false)
    expect((await pg.query<{ hour: string; sent: number }>(`select to_char(hour at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI') as hour, sent from push_relay.credentials`)).rows).toEqual([{ hour: '2026-11-08T11:00', sent: 5 }])
    expect(await store.credential(stored.id)).toEqual(stored)
    expect(await pushRelayMigration(pg.db)).toBeUndefined()
  })
})
