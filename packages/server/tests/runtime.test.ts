import { Kysely } from 'kysely'
import { PGliteDialect } from 'kysely-pglite-dialect'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { f, resource } from '@protobase/schema'
import { createAdmin } from '../src/create-admin'
import type { AdminOptions } from '../src/types'
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

const admin = (runtime: AdminOptions['runtime']) => createAdmin({ resources: [tasks], db, authenticate: testAuthenticator, options: { runtime } })

const metaFor = async (app: ReturnType<typeof admin>, roles: string) => (await app.request('/api/meta', { headers: as(1, roles) })).json()

describe('the runtime endpoint in /meta', () => {
  it('is named to admin callers only', async () => {
    const app = admin({ url: 'https://cloud.example.com/apps/7/runtime/' })
    expect((await metaFor(app, 'admin')).runtime).toEqual({ url: 'https://cloud.example.com/apps/7/runtime' })
    expect((await metaFor(app, 'sales,admin')).runtime).toEqual({ url: 'https://cloud.example.com/apps/7/runtime' })
    expect(await metaFor(app, 'ai')).not.toHaveProperty('runtime')
  })

  it('is named to nobody without a URL', async () => {
    expect(await metaFor(admin(undefined), 'admin')).not.toHaveProperty('runtime')
    expect(await metaFor(admin(false), 'admin')).not.toHaveProperty('runtime')
  })
})
