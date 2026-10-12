import { Kysely } from 'kysely'
import { PGliteDialect } from 'kysely-pglite-dialect'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { f, resource } from '@protobase/schema'
import { createAdmin } from '../src/create-admin'
import type { AdminOptions } from '../src/admin-options'
import { as, testAuthenticator } from '../../../test-support/server'
import { createEmptyPg } from '../../../test-support/pglite-snapshot'

const tasks = resource('tasks')
  .table('tasks')
  .fields({ id: f.integer().readOnly(), title: f.text() })
  .primaryKey((r) => r.id)

let db: Kysely<any>
beforeAll(async () => {
  const pg = await createEmptyPg()
  await pg.exec('create table tasks (id integer generated always as identity primary key, title text not null)')
  db = new Kysely({ dialect: new PGliteDialect(pg) })
})
afterAll(async () => { await db.destroy() })

const admin = (maps: AdminOptions['maps']) => createAdmin({ resources: [tasks], db, authenticate: testAuthenticator, options: { maps } })

const metaFor = async (app: ReturnType<typeof admin>, roles: string) => (await app.request('/api/meta', { headers: as(1, roles) })).json()

describe('the map style in /meta', () => {
  it('names the style to every caller, so the admin app draws its maps', async () => {
    const app = admin({ style: 'https://tiles.example.com/style.json' })
    expect((await metaFor(app, 'sales')).maps).toEqual({ style: 'https://tiles.example.com/style.json' })
  })

  it('is off without a style', async () => {
    expect(await metaFor(admin(undefined), 'admin')).not.toHaveProperty('maps')
    expect(await metaFor(admin(false), 'admin')).not.toHaveProperty('maps')
  })
})
