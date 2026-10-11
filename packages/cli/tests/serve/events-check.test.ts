import { Kysely } from 'kysely'
import { PGliteDialect } from 'kysely-pglite-dialect'
import { describe, expect, it, vi } from 'vitest'
import { f, resource } from '@protobase/schema'
import { changesMigration } from '@protobase/server'
import { createEmptyPg } from '../../../../test-support/pglite-snapshot'
import { startServe } from '../../src/serve/lifecycle'

const notes = resource('notes').table('notes').fields({ id: f.integer(), body: f.text() }).primaryKey((r) => r.id).events((e) => e.crud())
const project = { config: { notes }, authenticate: () => ({ user: { id: 1, roles: ['admin'] } }) }
const env = { port: 0, databaseUrl: 'postgres://unused/app', requestLog: false, filesCleanupMinutes: 0 }

describe('startServe with resource events', () => {
  it('does not start while a resource with events has no triggers, and drains its pool', async () => {
    const pg = await createEmptyPg()
    await pg.exec('create table notes (id integer primary key, body text not null)')
    const db = Object.assign(new Kysely<any>({ dialect: new PGliteDialect(pg) }), { destroy: vi.fn(async () => {}) })
    await expect(startServe({ project, env, createDb: () => db })).rejects.toThrow('The changes of notes are not captured as their events need')
    expect(db.destroy).toHaveBeenCalledTimes(1)
    await pg.exec((await changesMigration(db, [notes.toModel()]))!)
    const server = await startServe({ project, env, createDb: () => db })
    await server.close()
    await pg.close()
  })
})
