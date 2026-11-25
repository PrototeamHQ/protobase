import { Kysely } from 'kysely'
import { describe, expect, it, vi } from 'vitest'
import { f, resource } from '@protobase/schema'
import { captureSchemaSql, neededModules } from '@protobase/server'
import { startServe } from '../../src/serve/lifecycle'
import { servedConfig } from '../support/served-config'
import { recordModules } from '../support/recorded-modules'
import { openSnapshotDb, type SnapshotDb } from '../../../../test-support/sql-snapshot'

const notes = resource('notes').table('notes').fields({ id: f.integer(), body: f.text() }).primaryKey((r) => r.id).events((e) => e.crud())
const config = servedConfig({ config: { notes }, authenticate: () => ({ user: { id: 1, roles: ['admin'] } }) })
const env = { port: 0, databaseUrl: 'postgres://unused/app', requestLog: false, filesCleanupMinutes: 0, runJobs: true, startupChecks: true, trustedProxies: [] }

describe('startServe with resource events', () => {
  it('does not start while the record of migrations lacks the change capture, and drains its pool', async () => {
    const pg = await openSnapshotDb('jobs')
    await pg.exec('create table notes (id integer primary key, body text not null)')
    await recordModules(pg.db)
    const db = Object.assign(new Kysely<any>({ dialect: pg.dialect }), { destroy: vi.fn(async () => {}) })
    await expect(startServe({ config, env, openDb: () => ({ db }) })).rejects.toThrow('the database lacks the change capture, which this version needs at step 1 (outbox)')
    expect(db.destroy).toHaveBeenCalledTimes(1)
    await pg.exec(captureSchemaSql([notes.toModel()]))
    await recordModules(pg.db, neededModules({ models: [notes.toModel()], views: [], jobs: [], signIn: false }))
    const server = await startServe({ config, env, openDb: () => ({ db }) })
    await server.close()
    await pg.close()
  })

  it('starts without reading the record with PROTOBASE_STARTUP_CHECKS=false', async () => {
    const pg = await openSnapshotDb('jobs')
    await pg.exec('create table notes (id integer primary key, body text not null)')
    const db = Object.assign(new Kysely<any>({ dialect: pg.dialect }), { destroy: vi.fn(async () => {}) })
    const server = await startServe({ config, env: { ...env, startupChecks: false }, openDb: () => ({ db }) })
    await server.close()
    await pg.close()
  })
})
