import { Kysely } from 'kysely'
import { PGliteDialect } from 'kysely-pglite-dialect'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
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
afterEach(() => { delete process.env.PROTOBASE_PLUGINS })

const admin = (plugins: AdminOptions['plugins']) => createAdmin({ resources: [tasks], db, authenticate: testAuthenticator, options: { plugins } })

const metaFor = async (app: ReturnType<typeof admin>, roles: string) => (await app.request('/api/meta', { headers: as(1, roles) })).json()

describe('the plugins in /meta', () => {
  it('names the options\' plugins and then PROTOBASE_PLUGINS\', each to the roles it is for', async () => {
    process.env.PROTOBASE_PLUGINS = 'https://cloud.example.com/plugins/tasks/plugin.json'
    const app = admin([{ url: '/plugins/board/plugin.json', settings: { columns: 3 } }, { url: 'https://cdn.example.com/audit/plugin.json', roles: ['admin'] }])
    expect((await metaFor(app, 'sales')).plugins).toEqual([{ url: '/plugins/board/plugin.json', settings: { columns: 3 } }, { url: 'https://cloud.example.com/plugins/tasks/plugin.json' }])
    expect((await metaFor(app, 'admin')).plugins).toEqual([
      { url: '/plugins/board/plugin.json', settings: { columns: 3 } },
      { url: 'https://cdn.example.com/audit/plugin.json' },
      { url: 'https://cloud.example.com/plugins/tasks/plugin.json' },
    ])
  })

  it('names none without plugins, or when the option is false', async () => {
    expect(await metaFor(admin(undefined), 'admin')).not.toHaveProperty('plugins')
    process.env.PROTOBASE_PLUGINS = 'https://cloud.example.com/plugins/tasks/plugin.json'
    expect(await metaFor(admin(false), 'admin')).not.toHaveProperty('plugins')
  })

  it("names the bundle's own plugins first, to everyone, even when the option is false", async () => {
    process.env.PROTOBASE_PLUGINS = 'https://cloud.example.com/plugins/tasks/plugin.json'
    const app = createAdmin({ resources: [tasks], db, authenticate: testAuthenticator, bundlePlugins: ['/plugins/app/plugin.json'], options: { plugins: false } })
    expect((await metaFor(app, 'sales')).plugins).toEqual([{ url: '/plugins/app/plugin.json' }])
  })

  it('stops the server at startup on a plugin URL that is no URL', () => {
    process.env.PROTOBASE_PLUGINS = 'plugin.json'
    expect(() => admin(undefined)).toThrow('PROTOBASE_PLUGINS names "plugin.json", which is no URL')
  })
})
