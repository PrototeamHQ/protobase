import { Kysely } from 'kysely'
import { describe, expect, it } from 'vitest'
import { f, resource } from '@protobase/schema'
import { changesMigration } from '@protobase/server'
import { checkServerStartup } from '../../src/doctor/startup'
import { servedConfig } from '../support/served-config'
import { openSnapshotDb } from '../../../../test-support/sql-snapshot'

const notes = resource('notes').table('notes').fields({ id: f.integer(), body: f.text() }).primaryKey((r) => r.id).events((e) => e.crud())
const config = servedConfig({ config: { notes }, authenticate: () => ({ user: { id: 1, roles: ['admin'] } }) })

describe("doctor's startup checks", () => {
  it('refuses a resource with events and no triggers with the server\'s message, and passes once the migration is applied', async () => {
    const pg = await openSnapshotDb('jobs')
    const db = new Kysely<any>({ dialect: pg.dialect })
    await pg.exec('create table notes (id integer primary key, body text not null)')
    await expect(checkServerStartup(config, { db })).rejects.toThrow('The changes of notes are not captured as their events, history or live updates need')
    await pg.exec((await changesMigration(db, [notes.toModel()]))!)
    await checkServerStartup(config, { db })
    await pg.close()
  })
})
