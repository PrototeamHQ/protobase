import { Kysely } from 'kysely'
import { describe, expect, it, vi } from 'vitest'
import { f, resource } from '@protobase/schema'
import { changesMigration } from '@protobase/server'
import { startServe } from '../../src/serve/lifecycle'
import { openSnapshotDb, type SnapshotDb } from '../../../../test-support/sql-snapshot'

const notes = resource('notes').table('notes').fields({ id: f.integer(), body: f.text() }).primaryKey((r) => r.id).events((e) => e.crud())
const project = { config: { notes }, authenticate: () => ({ user: { id: 1, roles: ['admin'] } }) }
const env = { port: 0, databaseUrl: 'postgres://unused/app', requestLog: false, filesCleanupMinutes: 0, runJobs: true, startupChecks: true }

describe('startServe with resource events', () => {
  it('does not start while a resource with events has no triggers, and drains its pool', async () => {
    const pg = await openSnapshotDb('jobs')
    await pg.exec('create table notes (id integer primary key, body text not null)')
    const db = Object.assign(new Kysely<any>({ dialect: pg.dialect }), { destroy: vi.fn(async () => {}) })
    await expect(startServe({ project, env, createDb: () => db })).rejects.toThrow('The changes of notes are not captured as their events or history need')
    expect(db.destroy).toHaveBeenCalledTimes(1)
    await pg.exec((await changesMigration(db, [notes.toModel()]))!)
    const server = await startServe({ project, env, createDb: () => db })
    await server.close()
    await pg.close()
  })

  it('starts without reading the triggers with PROTOBASE_STARTUP_CHECKS=false', async () => {
    const pg = await openSnapshotDb('jobs')
    await pg.exec('create table notes (id integer primary key, body text not null)')
    const db = Object.assign(new Kysely<any>({ dialect: pg.dialect }), { destroy: vi.fn(async () => {}) })
    const server = await startServe({ project, env: { ...env, startupChecks: false }, createDb: () => db })
    await server.close()
    await pg.close()
  })
})
