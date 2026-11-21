import { Kysely, sql } from 'kysely'
import { Hono } from 'hono'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { changesMigration, checkChanges } from '../src/changes/capture-schema'
import { createAdmin } from '../src/create-admin'
import { createErrorHandler } from '../src/error-handler'
import { mailFeedbackRoutes } from '../src/mail/feedback/feedback-routes'
import { checkMailFeedbackSchema, mailFeedbackMigration } from '../src/mail/feedback/feedback-schema'
import { mailFeedbackHeaders } from '../src/mail/feedback/feedback-signing'
import { recordFeedback } from '../src/mail/feedback/feedback-store'
import { mailFeedbackResource } from '../src/mail/feedback/mail-feedback-resource'
import sesBounce from '../src/mail/feedback/testing/ses-bounce.json' with { type: 'json' }
import { testSnsSigner } from '../src/mail/feedback/testing/sns-signer'
import { signTestToken, testAuthenticator } from '../../../test-support/server'
import { openSnapshotDb } from '../../../test-support/sql-snapshot'

const model = mailFeedbackResource.toModel()
const sns = testSnsSigner()

let db: Kysely<any>
let feedback: Hono
let admin: ReturnType<typeof createAdmin>
beforeAll(async () => {
  const pg = await openSnapshotDb('jobs')
  db = new Kysely({ dialect: pg.dialect })
  // As `protobase migration` writes them: the table, then the capture of its events, planned before the table exists.
  const table = await mailFeedbackMigration(db)
  const capture = await changesMigration(db, [model], undefined, [model.name])
  await pg.exec(table!)
  await pg.exec(capture!)
  feedback = new Hono()
  feedback.onError(createErrorHandler(() => {}))
  feedback.route('/', mailFeedbackRoutes({ settings: { sesTopics: [sesBounce.TopicArn], platformSecret: 'platform secret' }, record: (report) => recordFeedback(db, report), certificates: sns.certificates, confirm: async () => {} }))
  admin = createAdmin({ resources: [], db, authenticate: testAuthenticator, mailFeedback: true })
})
afterAll(async () => { await db.destroy() })

const rows = () => db.selectFrom('mail.feedback').select(['provider', 'event_id', 'type', 'bounce_type', 'recipient', 'message_id', 'reason']).orderBy('id').execute()
const captured = async () => (await sql<{ resource: string; type: string }>`select resource, new->>'type' as type from changes.outbox order by id`.execute(db)).rows
const asAdmin = (path: string, init: RequestInit = {}) => admin.request(`/api/v1${path}`, { ...init, headers: { authorization: `Bearer ${signTestToken({ sub: 'ann', roles: ['admin'] })}`, 'content-type': 'application/json' } })

describe('mail feedback', () => {
  it('has its table and the capture of its events once the migrations ran', async () => {
    await expect(checkMailFeedbackSchema(db)).resolves.toBeUndefined()
    await expect(checkChanges(db, [model])).resolves.toBeUndefined()
    expect(await mailFeedbackMigration(db)).toBeUndefined()
  })

  it('writes nothing for a report whose signature does not check out', async () => {
    const body = JSON.stringify({ type: 'bounce', recipient: 'ada@example.com' })
    expect((await feedback.request('/protobase', { method: 'POST', body, headers: await mailFeedbackHeaders('another secret', 'forged', body) })).status).toBe(401)
    expect((await feedback.request('/ses', { method: 'POST', body: JSON.stringify(sesBounce) })).status).toBe(401)
    expect(await rows()).toEqual([])
    expect(await captured()).toEqual([])
  })

  it("writes a signed report's records once, lower-cased, and captures each for its event", async () => {
    const body = JSON.stringify({ type: 'complaint', recipient: 'Ada@Example.com', message_id: '<1@shop.example.com>' })
    const headers = await mailFeedbackHeaders('platform secret', 'report-1', body)
    expect((await feedback.request('/protobase', { method: 'POST', body, headers })).status).toBe(204)
    expect((await feedback.request('/protobase', { method: 'POST', body, headers })).status).toBe(204)
    expect((await feedback.request('/ses', { method: 'POST', body: JSON.stringify(sns.signed(sesBounce)) })).status).toBe(204)
    expect(await rows()).toEqual([
      { provider: 'protobase', event_id: 'report-1', type: 'complaint', bounce_type: null, recipient: 'ada@example.com', message_id: '<1@shop.example.com>', reason: null },
      { provider: 'ses', event_id: sesBounce.MessageId, type: 'bounce', bounce_type: 'hard', recipient: 'jane@example.com', message_id: 'custom-message-ID', reason: 'smtp; 550 5.1.1 <jane@example.com>... User' },
    ])
    expect(await captured()).toEqual([{ resource: 'mail_feedback', type: 'complaint' }, { resource: 'mail_feedback', type: 'bounce' }])
  })

  it('lists the feedback to admins, by recipient, who cannot change it', async () => {
    const listed = await asAdmin(`/mail_feedback?filter=${encodeURIComponent('recipient = "jane@example.com"')}`)
    expect(listed.status).toBe(200)
    expect(await listed.json()).toMatchObject({ items: [{ recipient: 'jane@example.com', type: 'bounce', bounce_type: 'hard' }] })
    expect((await asAdmin('/mail_feedback', { method: 'POST', body: JSON.stringify({ type: 'bounce', recipient: 'bo@example.com' }) })).status).toBe(403)
  })
})
