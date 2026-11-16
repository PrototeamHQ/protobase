import { Kysely } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Card, Page, Trans, page, translations } from '@protobase/layout'
import { f, resource, view } from '@protobase/schema'
import { createAdmin } from '../src/create-admin'
import { as, testAuthenticator } from '../../../test-support/server'
import { openSnapshotDb } from '../../../test-support/sql-snapshot'

const tasks = resource('tasks')
  .table('tasks')
  .fields({ id: f.integer().readOnly(), title: f.text(), status: f.enum(['open', 'done']) })
  .primaryKey((r) => r.id)

const texts = translations({
  en: { today: { title: 'Today', open: '{count, plural, one {# open task} other {# open tasks}}', unused: 'Unused' }, resources: { tasks: { names: { singular: 'Task', plural: 'Tasks' }, fields: { status: { label: 'Status', values: { done: 'Done' } } } } } },
  nl: { today: { title: 'Vandaag', open: '{count, plural, one {# open taak} other {# open taken}}', unused: 'Ongebruikt' }, resources: { tasks: { names: { singular: 'Taak', plural: 'Taken' }, fields: { status: { label: 'Staat', values: { done: 'Klaar' } } } } } },
})

const today = page('today', Page({ title: Trans({ i18nKey: 'today.title' }), children: Card({ title: Trans({ i18nKey: 'today.open', values: { count: 2 } }) }) }))
const tasksView = view<typeof tasks>('tasks').names({ singular: 'Task', plural: 'Tasks' }).fields((r) => ({ status: r.status.label('Status').valueLabels({ open: 'Open', done: 'Done' }) }))

let db: Kysely<any>
beforeAll(async () => {
  const pg = await openSnapshotDb('empty')
  await pg.exec('create table tasks (id integer generated always as identity primary key, title text not null, status text not null)')
  db = new Kysely({ dialect: pg.dialect })
})
afterAll(async () => {
  await db.destroy()
})

const admin = (locale?: 'en' | 'nl') => createAdmin({ resources: [tasks], views: [tasksView], pages: [today], translations: texts, db, authenticate: testAuthenticator, ...(locale && { options: { locale } }) })

const metaIn = async (app: ReturnType<typeof admin>, language: string) => {
  const answer = await app.request('/api/meta', { headers: { ...as(1, 'admin'), 'accept-language': language } })
  return { body: await answer.json(), version: answer.headers.get('x-meta-version') }
}

describe("the app's texts in /meta", () => {
  it("serve the reader's language, only the messages their pages name, and the page titles and labels in it", async () => {
    const { body } = await metaIn(admin(), 'nl-BE, en;q=0.5')
    expect(body.texts).toEqual({ locale: 'nl', messages: { 'today.title': 'Vandaag', 'today.open': '{count, plural, one {# open taak} other {# open taken}}' } })
    expect(body.pages[0].title).toBe('Vandaag')
    const shown = body.views.find((entry: { resource: string }) => entry.resource === 'tasks')
    expect(shown.names).toEqual({ singular: 'Taak', plural: 'Taken' })
    expect(shown.fields.status).toMatchObject({ label: 'Staat', valueLabels: { open: 'Open', done: 'Klaar' } })
  })

  it("fall back to English, keep to the app's own language, and move the meta version with the language", async () => {
    expect((await metaIn(admin(), 'fr')).body.texts.locale).toBe('en')
    expect((await metaIn(admin('en'), 'nl')).body.texts.locale).toBe('en')
    const app = admin()
    expect((await metaIn(app, 'nl')).version).not.toBe((await metaIn(app, 'en')).version)
  })

  it('refuse to start when a page names a key the texts lack', () => {
    const broken = page('broken', Page({ title: Trans({ i18nKey: 'today.nope' }) }))
    expect(() => createAdmin({ resources: [tasks], pages: [broken], translations: texts, db, authenticate: testAuthenticator })).toThrow(/no language has "today.nope"/)
  })
})
