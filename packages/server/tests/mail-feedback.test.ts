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

  it('writes a complaint that names its message but not who complained once, and captures it for its event', async () => {
    const body = JSON.stringify({ type: 'complaint', message_id: '<2@shop.example.com>', reason: 'abuse' })
    const headers = await mailFeedbackHeaders('platform secret', 'report-2', body)
    expect((await feedback.request('/protobase', { method: 'POST', body, headers })).status).toBe(204)
    expect((await feedback.request('/protobase', { method: 'POST', body, headers })).status).toBe(204)
    expect((await rows()).slice(2)).toEqual([{ provider: 'protobase', event_id: 'report-2', type: 'complaint', bounce_type: null, recipient: null, message_id: '<2@shop.example.com>', reason: 'abuse' }])
    expect((await captured()).slice(2)).toEqual([{ resource: 'mail_feedback', type: 'complaint' }])
    const event = (await sql<{ recipient: string | null; message_id: string }>`select new->>'recipient' as recipient, new->>'message_id' as message_id from changes.outbox order by id desc limit 1`.execute(db)).rows
    expect(event).toEqual([{ recipient: null, message_id: '<2@shop.example.com>' }])
  })

  it('lists the feedback to admins, by recipient, who cannot change it', async () => {
    const listed = await asAdmin(`/mail_feedback?filter=${encodeURIComponent('recipient = "jane@example.com"')}`)
    expect(listed.status).toBe(200)
    expect(await listed.json()).toMatchObject({ items: [{ recipient: 'jane@example.com', type: 'bounce', bounce_type: 'hard' }] })
    expect((await asAdmin('/mail_feedback', { method: 'POST', body: JSON.stringify({ type: 'bounce', recipient: 'bo@example.com' }) })).status).toBe(403)
  })
})

// The table as the first version with mail feedback made it, every record naming its recipient.
const earlierTable = `create schema if not exists "mail";
create table if not exists mail.feedback (
  "id" bigint generated always as identity primary key,
  "provider" text not null,
  "event_id" text not null,
  "type" text not null check ("type" in ('bounce', 'complaint')),
  "bounce_type" text check ("bounce_type" is null or ("bounce_type" in ('hard', 'soft') and "type" = 'bounce')),
  "recipient" text not null check ("recipient" = lower("recipient")),
  "message_id" text,
  "provider_message_id" text,
  "reason" text,
  "occurred_at" timestamptz,
  "created_at" timestamptz not null
);
create unique index if not exists "feedback_provider_event_recipient" on mail.feedback ("provider", "event_id", "recipient");
create index if not exists "feedback_recipient" on mail.feedback ("recipient");
create index if not exists "feedback_message_id" on mail.feedback ("message_id");
create index if not exists "feedback_provider_message_id" on mail.feedback ("provider_message_id");
create index if not exists "feedback_type" on mail.feedback ("type");
create index if not exists "feedback_created_at" on mail.feedback ("created_at");`

describe("an earlier version's mail feedback table", () => {
  it('takes a complaint without a recipient once migrated, still once per report, and refuses a bounce without one', async () => {
    const pg = await openSnapshotDb('jobs')
    const earlier = new Kysely<any>({ dialect: pg.dialect })
    await pg.exec(earlierTable)
    await expect(checkMailFeedbackSchema(earlier)).rejects.toThrow('feedback_provider_event_recipient_once')
    await pg.exec((await mailFeedbackMigration(earlier))!)
    await expect(checkMailFeedbackSchema(earlier)).resolves.toBeUndefined()
    expect(await mailFeedbackMigration(earlier)).toBeUndefined()
    const report = { provider: 'protobase', eventId: 'report-1', records: [{ type: 'complaint', message_id: '<1@shop.example.com>' }] } as const
    await recordFeedback(earlier, report)
    await recordFeedback(earlier, report)
    expect(await earlier.selectFrom('mail.feedback').select(['recipient', 'message_id']).execute()).toEqual([{ recipient: null, message_id: '<1@shop.example.com>' }])
    // @ts-expect-error A bounce without its recipient, which the endpoints never write, to show the table refuses it too.
    await expect(recordFeedback(earlier, { provider: 'protobase', eventId: 'report-2', records: [{ type: 'bounce', message_id: '<1@shop.example.com>' }] })).rejects.toThrow('feedback_names_recipient')
    await earlier.destroy()
  })

  it('gets its unique index back once migrated again after losing it', async () => {
    const pg = await openSnapshotDb('jobs')
    const earlier = new Kysely<any>({ dialect: pg.dialect })
    await pg.exec(earlierTable)
    await pg.exec((await mailFeedbackMigration(earlier))!)
    await pg.exec('drop index mail.feedback_provider_event_recipient_once')
    await expect(checkMailFeedbackSchema(earlier)).rejects.toThrow('feedback_provider_event_recipient_once')
    await pg.exec((await mailFeedbackMigration(earlier))!)
    await expect(checkMailFeedbackSchema(earlier)).resolves.toBeUndefined()
    // @ts-expect-error A complaint naming neither its recipient nor its message, to show the constraint is still there.
    await expect(recordFeedback(earlier, { provider: 'protobase', eventId: 'report-1', records: [{ type: 'complaint' }] })).rejects.toThrow('feedback_names_recipient')
    await earlier.destroy()
  })
})
