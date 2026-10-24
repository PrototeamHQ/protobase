import { createECDH } from 'node:crypto'
import { sql, type Kysely } from 'kysely'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineJob } from '../src/jobs/define-job'
import { startJobs, type JobsRuntime } from '../src/jobs/runtime'
import { guardedSender } from '../src/notifications/guarded-sender'
import { postgresHistoryStore } from '../src/notifications/postgres-history-store'
import { postgresDeviceStore } from '../src/notifications/postgres-store'
import { pushJob } from '../src/notifications/push-job'
import { pushJobName } from '../src/notifications/push-job-name'
import { notificationsMigration } from '../src/notifications/schema'
import { sendNotification } from '../src/notifications/send-notification'
import { generateVapidKeys } from '../src/notifications/web-push/keys'
import { readVapidSettings } from '../src/notifications/web-push/vapid-settings'
import { webPushSender } from '../src/notifications/web-push/web-push-sender'
import { openPostgresDatabase, postgresTemplateReady } from '../../../test-support/postgres-database'

// The send job through the jobs runtime on real Postgres, whose workers poll and retry on real timers: enqueued with
// the caller's transaction, run, and delivered to a push service that takes everything.
vi.setConfig({ testTimeout: 30_000 })

const ready = await postgresTemplateReady('jobs')

const vapid = generateVapidKeys()
const settings = readVapidSettings({ PROTOBASE_VAPID_PUBLIC_KEY: vapid.publicKey, PROTOBASE_VAPID_PRIVATE_KEY: vapid.privateKey, PROTOBASE_VAPID_SUBJECT: 'mailto:admin@example.com' })!
const ecdh = createECDH('prime256v1')
ecdh.setPrivateKey(Buffer.alloc(32, 1))
const p256dh = ecdh.getPublicKey('base64url')
const auth = Buffer.alloc(16, 2).toString('base64url')

let runtime: JobsRuntime | undefined
afterEach(async () => {
  await runtime?.stop()
  runtime = undefined
})

const pushJobs = async (db: Kysely<any>) => (await sql<{ id: string }>`select id from jobs.job where name = ${pushJobName}`.execute(db)).rows

const app = async () => {
  const pg = await openPostgresDatabase('jobs')
  await pg.exec((await notificationsMigration(pg.db))!)
  const sent: string[] = []
  const fetch = async (request: Request) => {
    sent.push(request.url)
    return new Response(null, { status: 201 })
  }
  const senders = [guardedSender(webPushSender(settings, { fetch: fetch as typeof globalThis.fetch }), 0)]
  await postgresDeviceStore(pg.db).register('a', { kind: 'web', token: 'https://fcm.googleapis.com/fcm/send/a', p256dh, auth, environment: null, appId: null, userAgent: null })
  return { db: pg.db, sent, push: pushJob({}, senders), history: postgresHistoryStore(pg.db) }
}

describe.skipIf(!ready)('sending a notification', () => {
  it("is queued with the caller's transaction, then kept in the history and pushed", async () => {
    const { db, sent, push, history } = await app()
    runtime = await startJobs({ db, jobs: [push], pollSeconds: 0.5, shutdownSeconds: 5, onError: (error) => { throw error } })
    const rolledBack = db.transaction().execute(async (trx) => {
      await sendNotification(trx, { userIds: ['a'], inbox: true }, { title: 'Rolled back' })
      await sql`select 1 / 0`.execute(trx)
    })
    await expect(rolledBack).rejects.toThrow('division by zero')
    expect(await pushJobs(db)).toEqual([])
    await db.transaction().execute((trx) => sendNotification(trx, { userIds: ['a'], inbox: true }, { title: 'Update' }))
    expect((await runtime.drain(20)).drained).toBe(true)
    expect((await history.list('a', { limit: 10 })).map((entry) => entry.title)).toEqual(['Update'])
    expect(sent).toEqual(['https://fcm.googleapis.com/fcm/send/a'])
  })

  it("from a job's context, queues nothing for a try that threw and once for the try that succeeded", async () => {
    const { db, push } = await app()
    const announce = defineJob({
      name: 'announce',
      retryDelay: 1,
      run: async (_, { db, job, sendNotification }) => {
        await db.transaction().execute(async (trx) => {
          await sendNotification!(trx, { userIds: ['a'], inbox: false }, { title: 'Done' })
          if (job.attempt === 1) throw new Error('the write failed')
        })
      },
    })
    runtime = await startJobs({ db, jobs: [push, announce], pollSeconds: 0.5, shutdownSeconds: 5, onError: (error) => { throw error } })
    await announce.enqueue(db)
    await vi.waitFor(async () => expect((await sql<{ state: string }>`select state from jobs.job where name = 'announce'`.execute(db)).rows[0]!.state).toBe('completed'), { timeout: 20_000, interval: 100 })
    expect(await pushJobs(db)).toHaveLength(1)
  })
})
