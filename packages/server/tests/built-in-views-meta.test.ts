import { Kysely } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { f, resource } from '@protobase/schema'
import { createAdmin } from '../src/create-admin'
import { as, testAuthenticator } from '../../../test-support/server'
import { openSnapshotDb } from '../../../test-support/sql-snapshot'

// A resource with history and comments brings Failed jobs, Activity and Comments; the events schema is renamed, which moves Activity's table.
const notes = resource('notes').table('notes').fields({ id: f.integer().readOnly(), body: f.text() }).primaryKey((r) => r.id).history().comments()

let db: Kysely<any>
beforeAll(async () => {
  db = new Kysely<any>({ dialect: (await openSnapshotDb('empty')).dialect })
})
afterAll(async () => {
  await db.destroy()
})

describe('the views Protobase adds', () => {
  it('gives an admin Failed jobs, Activity and Comments in /meta, with their English texts', async () => {
    const app = createAdmin({ resources: [notes], db, authenticate: testAuthenticator, events: { schema: 'outbox' } })
    const meta = await (await app.request('/api/meta', { headers: as(undefined, 'admin') })).json()
    // The admin app's translations of these views stand on this answer.
    const shown = ['failed_jobs', 'record_history', 'record_comments']
    expect(meta.views.map((model: { resource: string }) => model.resource)).toEqual(shown)
    const recorded = {
      resources: meta.resources.filter((model: { name: string }) => shown.includes(model.name)),
      views: meta.views.filter((model: { resource: string }) => shown.includes(model.resource)),
    }
    await expect(`${JSON.stringify(recorded, null, 2)}\n`).toMatchFileSnapshot('../../ui/src/app/testing/built-in-views-meta.json')
  })
})
