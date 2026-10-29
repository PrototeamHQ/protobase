import { createECDH } from 'node:crypto'
import { Kysely, sql } from 'kysely'
import { describe, expect, it, vi } from 'vitest'
import type { JobContext } from '../src/jobs/job-types'
import { StaleJobError } from '../src/jobs/job-progress'
import { guardedSender } from '../src/notifications/guarded-sender'
import { postgresHistoryStore } from '../src/notifications/postgres-history-store'
import { postgresDeviceStore } from '../src/notifications/postgres-store'
import { pushJob } from '../src/notifications/push-job'
import { pushJobName } from '../src/notifications/push-job-name'
import { pushPayload, type PushPayload } from '../src/notifications/push-payload'
import { notificationsMigration } from '../src/notifications/schema'
import { checkedSend, type NotificationRecipients } from '../src/notifications/send-input'
import { generateVapidKeys } from '../src/notifications/web-push/keys'
import { readVapidSettings } from '../src/notifications/web-push/vapid-settings'
import { webPushSender } from '../src/notifications/web-push/web-push-sender'
import { openSnapshotDb } from '../../../test-support/sql-snapshot'

// The send job's tries on the Postgres stores and the jobs table, against a push service answering as each endpoint
// says. The keys are fixed, so what the database is sent is the same when recorded and replayed.
const ecdh = createECDH('prime256v1')
ecdh.setPrivateKey(Buffer.alloc(32, 1))
const p256dh = ecdh.getPublicKey('base64url')
const auth = Buffer.alloc(16, 2).toString('base64url')
const vapid = generateVapidKeys()
const settings = readVapidSettings({ PROTOBASE_VAPID_PUBLIC_KEY: vapid.publicKey, PROTOBASE_VAPID_PRIVATE_KEY: vapid.privateKey, PROTOBASE_VAPID_SUBJECT: 'mailto:admin@example.com' })!

const endpoint = (name: string) => `https://fcm.googleapis.com/fcm/send/${name}`

const pushService = (statuses: Record<string, number>) => {
  const sent: string[] = []
  const fetch = async (request: Request) => {
    const name = request.url.slice(request.url.lastIndexOf('/') + 1)
    sent.push(name)
    return new Response(null, { status: statuses[name] ?? 201 })
  }
  return { sent, fetch: fetch as typeof globalThis.fetch }
}

const open = async () => {
  const pg = await openSnapshotDb('jobs')
  await pg.exec((await notificationsMigration(pg.db))!)
  // The users the history points at, as auth's users table does: a deleted one takes their entries along.
  await pg.exec('create table people (id text primary key); insert into people values (\'a\'), (\'b\')')
  await pg.exec('alter table notifications.history add foreign key (user_id) references people (id) on delete cascade')
  const db = new Kysely<any>({ dialect: pg.dialect })
  return { db, devices: postgresDeviceStore(db), history: postgresHistoryStore(db) }
}

// A job as the runtime holds it while a try runs: enqueued, then taken now.
const queued = async (db: Kysely<any>, to: NotificationRecipients) => {
  const { rows } = await sql<{ id: string }>`select jobs.enqueue(${pushJobName}, ${JSON.stringify(checkedSend(to, { title: 'Update', url: 'https://app.example/x' }))}::jsonb) as id`.execute(db)
  return rows[0]!.id
}

const take = async (db: Kysely<any>, id: string, attempt: number): Promise<{ payload: PushPayload; job: JobContext['job'] }> => {
  const { rows } = await sql<{ data: unknown; started_on: Date }>`update jobs.job set state = 'active', started_on = now() + ${`${attempt} seconds`}::interval, retry_count = ${attempt - 1} where id = ${id}::uuid returning data, started_on`.execute(db)
  const checked = (await pushPayload['~standard'].validate(rows[0]!.data)) as { value: PushPayload }
  return { payload: checked.value, job: { id, name: pushJobName, attempt, maxAttempts: 5, startedOn: rows[0]!.started_on } }
}

const tryOnce = async (db: Kysely<any>, id: string, attempt: number, fetch: typeof globalThis.fetch) => {
  const { payload, job } = await take(db, id, attempt)
  const run = pushJob({}, [guardedSender(webPushSender(settings, { fetch }), 0)]).options.run
  return run(payload, { db, job, signal: new AbortController().signal, decryptField: vi.fn() })
}

const dataOf = async (db: Kysely<any>, id: string) => (await sql<{ data: Record<string, unknown> }>`select data from jobs.job where id = ${id}::uuid`.execute(db)).rows[0]!.data

describe('the send job on Postgres', () => {
  it('keeps the history once, removes a gone device, retries only the device that asked, then drops the message', async () => {
    const { db, devices, history } = await open()
    const web = (name: string) => ({ kind: 'web' as const, token: endpoint(name), p256dh, auth, environment: null, appId: null, userAgent: null, sessionId: null })
    await devices.register('a', web('a-ok'))
    await devices.register('a', web('a-gone'))
    await devices.register('b', web('b-busy'))
    const id = await queued(db, { userIds: ['a', 'b', 'deleted'], inbox: true })

    const first = pushService({ 'a-gone': 410, 'b-busy': 503 })
    await expect(tryOnce(db, id, 1, first.fetch)).rejects.toThrow('notifications.send: 1 deliveries are retried')
    expect(first.sent.sort()).toEqual(['a-gone', 'a-ok', 'b-busy'])
    expect((await devices.listForUser('a')).map((device) => device.token)).toEqual([endpoint('a-ok')])
    expect((await dataOf(db, id)).progress).toMatchObject({ recorded: ['a', 'b', 'deleted'], retried: [expect.any(String)] })

    const second = pushService({})
    await tryOnce(db, id, 2, second.fetch)
    expect(second.sent).toEqual(['b-busy'])
    expect((await history.list('a', { limit: 10 })).map((entry) => [entry.title, entry.url])).toEqual([['Update', 'https://app.example/x']])
    expect(await history.list('b', { limit: 10 })).toHaveLength(1)
    expect(await dataOf(db, id)).toEqual({ complete: true })
  })

  it('records nothing and pushes nothing from a try that no longer holds its job', async () => {
    const { db, history } = await open()
    const id = await queued(db, { userIds: ['a'], inbox: true })
    const { payload, job } = await take(db, id, 1)
    // pg-boss took the job again, as after this try's time ran out.
    await take(db, id, 2)
    const run = pushJob({}, []).options.run
    await expect(run(payload, { db, job, signal: new AbortController().signal, decryptField: vi.fn() })).rejects.toBeInstanceOf(StaleJobError)
    expect(await history.list('a', { limit: 10 })).toEqual([])
  })
})
