import { Kysely } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createAdmin } from '../src/create-admin'
import type { MailMessage } from '../src/mail/mail-message'
import { appBulkMailer } from '../src/mail/unsubscribe/bulk-mailer'
import { unsubscribesMigration } from '../src/mail/unsubscribe/unsubscribe-schema'
import { signTestToken, testAuthenticator } from '../../../test-support/server'
import { openSnapshotDb } from '../../../test-support/sql-snapshot'

let db: Kysely<any>
let app: ReturnType<typeof createAdmin>
beforeAll(async () => {
  const pg = await openSnapshotDb('empty')
  db = new Kysely({ dialect: pg.dialect })
  await pg.exec((await unsubscribesMigration(db))!)
  app = createAdmin({ resources: [], db, authenticate: testAuthenticator, secret: 'test secret', unsubscribe: { appUrl: 'https://shop.example.com' } })
})
afterAll(async () => { await db.destroy() })

const recording = () => {
  const sent: MailMessage[] = []
  return { sent, mailer: { send: async (message: MailMessage) => { sent.push(message); return { messageId: '<1@shop.example.com>' } } } }
}

const linkPath = (message: MailMessage) => new URL(message.headers!['List-Unsubscribe']!.slice(1, -1)).pathname
const oneClick = { method: 'POST', body: 'List-Unsubscribe=One-Click', headers: { 'content-type': 'application/x-www-form-urlencoded' } }
const asAdmin = (path: string, init: RequestInit = {}) => app.request(`/api/v1${path}`, { ...init, headers: { authorization: `Bearer ${signTestToken({ sub: 'ann', roles: ['admin'] })}`, 'content-type': 'application/json' } })

describe('one-click unsubscribe', () => {
  it('records the opt-out once, skips that topic to that recipient, and still sends another topic', async () => {
    const { sent, mailer } = recording()
    const mail = appBulkMailer(mailer, db, app.unsubscribe)
    const newsletter = { to: 'Ada@Example.com', subject: 'News', text: 'Hi', bulk: true, topic: 'newsletter' }

    expect(await mail.send(newsletter)).toEqual({ messageId: '<1@shop.example.com>', skipped: [], sent: [{ to: 'ada@example.com', messageId: '<1@shop.example.com>' }] })
    const link = linkPath(sent[0]!)
    expect(link).toMatch(/^\/api\/unsubscribe\//)

    expect((await app.request(link)).status).toBe(200)
    expect(await db.selectFrom('mail.unsubscribes').select('recipient').execute()).toEqual([])

    expect((await app.request(link, oneClick)).status).toBe(200)
    expect((await app.request(link, oneClick)).status).toBe(200)
    expect(await db.selectFrom('mail.unsubscribes').select(['recipient', 'topic']).execute()).toEqual([{ recipient: 'ada@example.com', topic: 'newsletter' }])

    expect(await mail.send(newsletter)).toEqual({ skipped: ['ada@example.com'], sent: [] })
    expect(sent).toHaveLength(1)
    expect(await mail.send({ ...newsletter, topic: 'digest' })).toMatchObject({ messageId: '<1@shop.example.com>', skipped: [] })
    expect(sent).toHaveLength(2)
  })

  it('refuses a forged link with 400 and records nothing', async () => {
    const answer = await app.request('/api/unsubscribe/eyJhIjoxfQ.AAAA', oneClick)
    expect(answer.status).toBe(400)
    expect(await db.selectFrom('mail.unsubscribes').select('recipient').where('recipient', '=', 'a').execute()).toEqual([])
  })

  it('lists the opt-outs to admins, who cannot change them', async () => {
    const listed = await asAdmin('/mail_unsubscribes')
    expect(listed.status).toBe(200)
    expect(await listed.json()).toMatchObject({ items: [{ recipient: 'ada@example.com', topic: 'newsletter' }] })
    expect((await asAdmin('/mail_unsubscribes', { method: 'POST', body: JSON.stringify({ recipient: 'bo@example.com', topic: 'newsletter' }) })).status).toBe(403)
  })
})
