import { Kysely } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { f, resource } from '@protobase/schema'
import { createAdmin } from '../src/create-admin'
import type { AdminOptions } from '../src/admin-options'
import { as, testAuthenticator } from '../../../test-support/server'
import { openSnapshotDb, type SnapshotDb } from '../../../test-support/sql-snapshot'

const tasks = resource('tasks')
  .table('tasks')
  .fields({ id: f.integer().readOnly(), title: f.text() })
  .primaryKey((r) => r.id)

let db: Kysely<any>
beforeAll(async () => {
  const pg = await openSnapshotDb('empty')
  await pg.exec('create table tasks (id integer generated always as identity primary key, title text not null)')
  db = new Kysely({ dialect: pg.dialect })
})
afterAll(async () => { await db.destroy() })

const admin = (errorReporting: AdminOptions['errorReporting']) => createAdmin({ resources: [tasks], db, authenticate: testAuthenticator, options: { errorReporting } })

const metaFor = async (app: ReturnType<typeof admin>, roles: string) => (await app.request('/api/meta', { headers: as(1, roles) })).json()

describe('error reporting in /meta', () => {
  it('names the DSN to every caller, so the admin app reports its errors', async () => {
    const app = admin({ dsn: 'https://public@errors.example.com/42', environment: 'staging' })
    expect((await metaFor(app, 'sales')).errorReporting).toEqual({ dsn: 'https://public@errors.example.com/42', environment: 'staging' })
  })

  it('is off without a DSN', async () => {
    expect(await metaFor(admin(undefined), 'admin')).not.toHaveProperty('errorReporting')
    expect(await metaFor(admin(false), 'admin')).not.toHaveProperty('errorReporting')
  })
})
