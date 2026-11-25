import { Kysely } from 'kysely'
import { describe, expect, it } from 'vitest'
import { f, resource } from '@protobase/schema'
import { captureSchemaSql, neededModules } from '@protobase/server'
import { captureFileIssues } from '../../src/doctor/capture-files'
import { normalisedSql } from '../../src/doctor/migration-sql'
import { checkServerStartup } from '../../src/doctor/startup'
import { servedConfig } from '../support/served-config'
import { recordModules } from '../support/recorded-modules'
import { openSnapshotDb } from '../../../../test-support/sql-snapshot'

const notes = resource('notes').table('notes').fields({ id: f.integer(), body: f.text() }).primaryKey((r) => r.id).events((e) => e.crud())
const config = servedConfig({ config: { notes }, authenticate: () => ({ user: { id: 1, roles: ['admin'] } }) })

describe("doctor's startup checks", () => {
  it("refuses a resource with events whose change capture the record lacks with the server's message, and passes once the migration is applied", async () => {
    const pg = await openSnapshotDb('jobs')
    const db = new Kysely<any>({ dialect: pg.dialect })
    const table = 'create table notes (id integer primary key, body text not null)'
    await pg.exec(table)
    await recordModules(pg.db)
    await expect(checkServerStartup(config, { db })).rejects.toThrow('the database lacks the change capture, which this version needs at step 1 (outbox)')
    const migration = captureSchemaSql([notes.toModel()])
    await pg.exec(migration)
    await recordModules(pg.db, neededModules({ models: [notes.toModel()], views: [], jobs: [], signIn: false }))
    await checkServerStartup(config, { db })
    // Without a database, doctor judges the same from the migrations: the table alone fails, and what `protobase
    // migration` writes passes.
    expect(captureFileIssues([notes.toModel()], undefined, normalisedSql(table)).issues).toEqual([expect.objectContaining({ message: expect.stringContaining('The changes of notes are not captured') })])
    expect(captureFileIssues([notes.toModel()], undefined, normalisedSql(`${table};\n${migration}`)).issues).toEqual([])
    await pg.close()
  })
})
